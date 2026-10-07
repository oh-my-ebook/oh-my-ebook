import { describe, expect, it } from 'vitest'
import type { SearchChunkResult } from '@/features/ebook-list/ebook-types'
import {
  MAX_SEARCH_CONTEXT_CHUNKS,
  estimateTextTokens,
  formatSearchContext,
  formatSearchContextWithChunks,
} from './format-search-context'

function createChunk(index: number, text = `청크 ${index} 본문`): SearchChunkResult {
  return {
    id: `chunk-${index}`,
    ordinal: index,
    text,
    tokenCount: text.split(/\s+/).length,
    score: index,
    sources: [{ pageNumber: index + 1, startLineIndex: 0, endLineIndex: 1 }],
  }
}

describe('formatSearchContext', () => {
  it('상위 다섯 청크를 페이지 출처와 함께 구성한다', () => {
    const context = formatSearchContext(
      Array.from({ length: 6 }, (_, index) => createChunk(index)),
      8_000,
    )

    expect(context).toContain('[문서 발췌 | p.1]')
    expect(context).toContain('[문서 발췌 | p.5]')
    expect(context).not.toContain('[문서 발췌 | p.6]')
    expect(context.match(/\[문서 발췌/g)).toHaveLength(MAX_SEARCH_CONTEXT_CHUNKS)
  })

  it('문맥을 전달받은 전체 프롬프트 예산 안에서 자른다', () => {
    const tokenBudget = 60
    const context = formatSearchContext(
      [createChunk(0, '하나 둘 셋 넷 다섯 여섯 일곱 여덟')],
      tokenBudget,
    )

    expect(estimateTextTokens(context)).toBeLessThanOrEqual(tokenBudget)
    expect(context).toContain('[문서 발췌 | p.1]')
    expect(formatSearchContext([], tokenBudget)).toBe('')
  })

  it('실제 프롬프트에 포함된 청크만 인용 출처로 반환한다', () => {
    const chunks = [createChunk(0, '첫 번째 발췌'), createChunk(1, '두 번째 발췌')]
    const firstChunkBudget = estimateTextTokens('[문서 발췌 | p.1]\n첫 번째 발췌')

    const result = formatSearchContextWithChunks(chunks, firstChunkBudget)

    expect(result.chunks).toEqual([chunks[0]])
    expect(result.context).not.toContain('p.2')
  })
})
