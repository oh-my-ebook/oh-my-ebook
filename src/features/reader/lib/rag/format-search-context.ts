import type { SearchChunkResult } from '@/features/ebook-list/ebook-types'

export const MAX_SEARCH_CONTEXT_CHUNKS = 5

export interface FormattedSearchContext {
  chunks: readonly SearchChunkResult[]
  context: string
}

// WebLLM이 로드한 토크나이저는 외부에 노출되지 않는다.
// UTF-8 바이트 수는 byte-level 토크나이저의 실제 토큰 수보다 작지 않은 보수적 상한이다.
export function estimateTextTokens(text: string): number {
  return new TextEncoder().encode(text).length
}

export function truncateToTokenBudget(text: string, tokenBudget: number): string {
  if (tokenBudget <= 0) return ''

  const trimmed = text.trim()
  if (estimateTextTokens(trimmed) <= tokenBudget) return trimmed

  const characters = Array.from(trimmed)
  let lower = 0
  let upper = characters.length
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2)
    if (estimateTextTokens(characters.slice(0, middle).join('')) <= tokenBudget) {
      lower = middle
    } else {
      upper = middle - 1
    }
  }
  return characters.slice(0, lower).join('').trimEnd()
}

export function formatSearchContextWithChunks(
  chunks: readonly SearchChunkResult[],
  tokenBudget: number,
): FormattedSearchContext {
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 0) {
    throw new RangeError('검색 문맥 토큰 예산은 0 이상의 정수여야 합니다.')
  }

  const excerpts: string[] = []
  const includedChunks: SearchChunkResult[] = []
  for (const chunk of chunks.slice(0, MAX_SEARCH_CONTEXT_CHUNKS)) {
    const pageNumber = chunk.sources[0]?.pageNumber
    const header = `[문서 발췌 | p.${pageNumber ?? '?'}]`
    const prefix = excerpts.length === 0 ? '' : '\n\n'
    const fixedText = `${prefix}${header}\n`
    const remainingTokens = tokenBudget - estimateTextTokens(excerpts.join('\n\n'))
    const textBudget = remainingTokens - estimateTextTokens(fixedText)
    if (textBudget <= 0) break

    const text = truncateToTokenBudget(chunk.text, textBudget)
    if (!text) continue
    excerpts.push(`${header}\n${text}`)
    includedChunks.push(chunk)
  }
  return { chunks: includedChunks, context: excerpts.join('\n\n') }
}

export function formatSearchContext(
  chunks: readonly SearchChunkResult[],
  tokenBudget: number,
): string {
  return formatSearchContextWithChunks(chunks, tokenBudget).context
}
