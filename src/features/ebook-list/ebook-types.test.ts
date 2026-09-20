import { describe, expect, expectTypeOf, it } from 'vitest'
import { SQLITE_COMMAND } from './ebook-consts'
import type { SearchChunkQuery, SearchChunkResult } from './ebook-types'

describe('BM25 검색 계약', () => {
  it('질문과 검색 결과의 페이지 출처를 표현한다', () => {
    const query = {
      bookId: 'book-1',
      terms: ['검색', '청크'],
      limit: 5,
    } satisfies SearchChunkQuery
    const result = {
      id: 'chunk-1',
      ordinal: 0,
      text: '검색 결과 본문',
      tokenCount: 4,
      score: 2.4,
      sources: [
        {
          pageNumber: 3,
          startLineIndex: 1,
          endLineIndex: 4,
        },
      ],
    } satisfies SearchChunkResult

    expectTypeOf(query.bookId).toEqualTypeOf<string>()
    expectTypeOf(query.terms).toEqualTypeOf<string[]>()
    expectTypeOf(result.score).toEqualTypeOf<number>()
    expectTypeOf(result.sources).toEqualTypeOf<
      { pageNumber: number; startLineIndex: number; endLineIndex: number }[]
    >()
    expect(SQLITE_COMMAND.SEARCH_CHUNKS).toBe('searchChunks')
  })
})
