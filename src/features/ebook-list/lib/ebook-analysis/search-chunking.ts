import { postprocessWithKiwi } from '@/lib/kiwi/client'
import type { OcrLineForChunking, SearchChunkInput } from '../../ebook-types'

export const DEFAULT_SEARCH_CHUNK_TOKEN_TARGET = 300

interface ChunkUnit {
  text: string
  tokenCount: number
  lines: OcrLineForChunking[]
  startsParagraph: boolean
}

interface MutableSearchChunk {
  text: string
  tokenCount: number
  lines: OcrLineForChunking[]
}

interface TextRange {
  text: string
  start: number
  end: number
}

interface SourceLineRange {
  line: OcrLineForChunking
  start: number
  end: number
}

function countTokens(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function splitSentences(text: string): TextRange[] {
  return [...text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)]
    .map((match) => {
      const sentence = match[0]
      const trimmed = sentence.trim()
      const leadingWhitespace = sentence.length - sentence.trimStart().length
      const start = (match.index ?? 0) + leadingWhitespace
      return { text: trimmed, start, end: start + trimmed.length }
    })
    .filter(({ text }) => Boolean(text))
}

function splitByTokenTarget(text: string, tokenTarget: number): TextRange[] {
  const tokens = [...text.matchAll(/\S+/g)]
  const parts: TextRange[] = []
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += tokenTarget) {
    const firstToken = tokens[tokenIndex]
    const lastToken = tokens[Math.min(tokenIndex + tokenTarget - 1, tokens.length - 1)]
    if (
      !firstToken ||
      !lastToken ||
      firstToken.index === undefined ||
      lastToken.index === undefined
    )
      continue
    const start = firstToken.index
    const end = lastToken.index + lastToken[0].length
    parts.push({ text: text.slice(start, end), start, end })
  }
  return parts
}

function joinProcessedLines(processedLines: string[], lines: OcrLineForChunking[]) {
  let text = ''
  const sourceLineRanges: SourceLineRange[] = []

  processedLines.forEach((processedLine, index) => {
    const line = lines[index]
    if (!line || !processedLine) return
    const separator = text ? ' ' : ''
    const start = text.length + separator.length
    text += `${separator}${processedLine}`
    sourceLineRanges.push({ line, start, end: text.length })
  })

  return { sourceLineRanges, text }
}

function getSourceLines(sourceLineRanges: SourceLineRange[], start: number, end: number) {
  return sourceLineRanges
    .filter((range) => range.start < end && start < range.end)
    .map((range) => range.line)
}

async function createParagraphUnits(
  lines: OcrLineForChunking[],
  signal: AbortSignal,
  tokenTarget: number,
): Promise<ChunkUnit[]> {
  const processed = await postprocessWithKiwi(lines.map((line) => line.raw_text).join('\n'), signal)
  const processedLines = processed.split('\n').map((line) => line.trim())
  if (processedLines.length !== lines.length) {
    throw new Error('Kiwi 처리 결과의 줄 수가 OCR 원문과 다릅니다.')
  }

  const { sourceLineRanges, text: paragraphText } = joinProcessedLines(processedLines, lines)
  const paragraphTokenCount = countTokens(paragraphText)
  if (paragraphTokenCount === 0) return []
  if (paragraphTokenCount <= tokenTarget) {
    return [
      {
        text: paragraphText,
        tokenCount: paragraphTokenCount,
        lines,
        startsParagraph: true,
      },
    ]
  }

  const units: ChunkUnit[] = []
  splitSentences(paragraphText).forEach((sentence) => {
    splitByTokenTarget(sentence.text, tokenTarget).forEach((part) => {
      const start = sentence.start + part.start
      const end = sentence.start + part.end
      const sourceLines = getSourceLines(sourceLineRanges, start, end)
      if (sourceLines.length) {
        units.push({
          text: part.text,
          tokenCount: countTokens(part.text),
          lines: sourceLines,
          startsParagraph: units.length === 0,
        })
      }
    })
  })
  return units
}

function createChunkSources(lines: OcrLineForChunking[]) {
  const sources: SearchChunkInput['sources'][number][] = []
  lines.forEach((line) => {
    const lastSource = sources.at(-1)
    if (
      lastSource &&
      lastSource.ocrPageId === line.ocr_page_id &&
      line.line_index <= lastSource.endLineIndex + 1
    ) {
      lastSource.endLineIndex = Math.max(lastSource.endLineIndex, line.line_index)
      return
    }
    sources.push({
      ocrPageId: line.ocr_page_id,
      startLineIndex: line.line_index,
      endLineIndex: line.line_index,
      sourceOrder: sources.length,
    })
  })
  return sources
}

function appendUnit(chunks: MutableSearchChunk[], unit: ChunkUnit, tokenTarget: number) {
  const lastChunk = chunks.at(-1)
  if (lastChunk && lastChunk.tokenCount + unit.tokenCount <= tokenTarget) {
    lastChunk.text += `${unit.startsParagraph ? '\n\n' : ' '}${unit.text}`
    lastChunk.tokenCount += unit.tokenCount
    lastChunk.lines.push(...unit.lines)
    return
  }
  chunks.push({ text: unit.text, tokenCount: unit.tokenCount, lines: [...unit.lines] })
}

export async function createSearchChunks(
  ocrLines: OcrLineForChunking[],
  signal: AbortSignal,
  tokenTarget = DEFAULT_SEARCH_CHUNK_TOKEN_TARGET,
): Promise<SearchChunkInput[]> {
  if (!Number.isSafeInteger(tokenTarget) || tokenTarget <= 0) {
    throw new RangeError('검색 청크 목표 토큰 수는 양의 정수여야 합니다.')
  }

  const paragraphs: OcrLineForChunking[][] = []
  let paragraph: OcrLineForChunking[] = []

  // 1. 빈 줄이 올 때까지 하나의 문단을 형성하고 빈 줄이 오면 문단 배열에 삽입
  ocrLines.forEach((line) => {
    if (line.raw_text.trim()) {
      paragraph.push(line)
      return
    }
    if (paragraph.length) paragraphs.push(paragraph)
    paragraph = []
  })
  if (paragraph.length) paragraphs.push(paragraph)

  const chunks: MutableSearchChunk[] = []
  // 2. 문단 단위로 Kiwi 후처리 후 청킹 단위로 합침
  //   - 문단이 목표 길이 이하면 문단 전체가 unit 하나
  //   - 문단이 길면 문장 단위 unit 여러 개
  //   - 문장도 길면 목표 토큰 수 단위 unit 여러 개
  for (const paragraph of paragraphs) {
    const units = await createParagraphUnits(paragraph, signal, tokenTarget)
    units.forEach((unit) => appendUnit(chunks, unit, tokenTarget))
  }

  return chunks.map((chunk, ordinal) => ({
    id: crypto.randomUUID(),
    ordinal,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    sources: createChunkSources(chunk.lines),
  }))
}
