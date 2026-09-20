import type { SearchChunkResult } from '@/features/ebook-list/ebook-types'

export const MAX_SEARCH_CONTEXT_TOKENS = 8_000
export const MAX_SEARCH_CONTEXT_CHUNKS = 5

function countTokens(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

function truncateToTokenBudget(text: string, tokenBudget: number): string {
  return text.trim().split(/\s+/).slice(0, tokenBudget).join(' ')
}

export function formatSearchContext(
  chunks: readonly SearchChunkResult[],
  tokenBudget = MAX_SEARCH_CONTEXT_TOKENS,
): string {
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 0) {
    throw new RangeError('검색 문맥 토큰 예산은 0 이상의 정수여야 합니다.')
  }

  let remainingTokens = tokenBudget
  const excerpts: string[] = []
  for (const chunk of chunks.slice(0, MAX_SEARCH_CONTEXT_CHUNKS)) {
    const pageNumber = chunk.sources[0]?.pageNumber
    const header = `[문서 발췌 | p.${pageNumber ?? '?'}]`
    const headerTokens = countTokens(header)
    if (remainingTokens <= headerTokens) break

    const text = truncateToTokenBudget(chunk.text, remainingTokens - headerTokens)
    if (!text) continue
    excerpts.push(`${header}\n${text}`)
    remainingTokens -= headerTokens + countTokens(text)
    if (remainingTokens === 0) break
  }
  return excerpts.join('\n\n')
}
