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

function countTokens(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function splitSentences(text: string) {
  return (
    text
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  )
}

function splitByTokenTarget(text: string, tokenTarget: number) {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const parts: string[] = []
  for (let start = 0; start < tokens.length; start += tokenTarget) {
    parts.push(tokens.slice(start, start + tokenTarget).join(' '))
  }
  return parts
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

  const paragraphText = processedLines.filter(Boolean).join(' ')
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
  processedLines.forEach((processedLine, index) => {
    const line = lines[index]
    if (!line || !processedLine) return
    splitSentences(processedLine).forEach((sentence) => {
      splitByTokenTarget(sentence, tokenTarget).forEach((text) => {
        units.push({
          text,
          tokenCount: countTokens(text),
          lines: [line],
          startsParagraph: units.length === 0,
        })
      })
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
