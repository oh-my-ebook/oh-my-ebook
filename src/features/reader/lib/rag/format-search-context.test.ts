import { describe, expect, it } from 'vitest'
import type { SearchChunkResult } from '@/features/ebook-list/ebook-types'
import {
  MAX_SEARCH_CONTEXT_CHUNKS,
  MAX_SEARCH_CONTEXT_TOKENS,
  formatSearchContext,
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
    const context = formatSearchContext(Array.from({ length: 6 }, (_, index) => createChunk(index)))

    expect(context).toContain('[문서 발췌 | p.1]')
    expect(context).toContain('[문서 발췌 | p.5]')
    expect(context).not.toContain('[문서 발췌 | p.6]')
    expect(context.match(/\[문서 발췌/g)).toHaveLength(MAX_SEARCH_CONTEXT_CHUNKS)
  })

  it('문맥을 토큰 예산 안에서 자른다', () => {
    const context = formatSearchContext([createChunk(0, '하나 둘 셋 넷 다섯 여섯 일곱 여덟')], 6)

    expect(context.trim().split(/\s+/)).toHaveLength(6)
    expect(formatSearchContext([], MAX_SEARCH_CONTEXT_TOKENS)).toBe('')
  })
})
