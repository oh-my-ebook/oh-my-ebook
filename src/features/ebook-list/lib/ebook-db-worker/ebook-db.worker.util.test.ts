import { describe, expect, it } from 'vitest'
import { isStoreSearchIndexInput } from './ebook-db.worker.util'

describe('검색 역색인 저장 입력 검증', () => {
  it('청크별 term 빈도를 허용한다', () => {
    expect(
      isStoreSearchIndexInput({
        bookId: 'book-id',
        chunks: [
          {
            id: 'chunk-id',
            ordinal: 0,
            text: '검색할 청크',
            tokenCount: 3,
            sources: [
              {
                ocrPageId: 'page-1',
                startLineIndex: 0,
                endLineIndex: 2,
                sourceOrder: 0,
              },
            ],
            terms: [
              { term: '전자책', termFrequency: 1 },
              { term: '검색', termFrequency: 2 },
            ],
          },
        ],
      }),
    ).toBe(true)
  })

  it.each([
    {
      terms: [],
      sources: [{ ocrPageId: 'page-1', startLineIndex: 2, endLineIndex: 1, sourceOrder: 0 }],
    },
    { terms: [], ordinal: -1 },
    { terms: [], tokenCount: 0 },
    { terms: [{ term: '', termFrequency: 1 }] },
    { terms: [{ term: '검색', termFrequency: 0 }] },
    {
      terms: [
        { term: '검색', termFrequency: 1 },
        { term: '검색', termFrequency: 2 },
      ],
    },
  ])('잘못된 청크·원본 범위·term 빈도를 거부한다', ({ terms, ...chunk }) => {
    expect(
      isStoreSearchIndexInput({
        bookId: 'book-id',
        chunks: [
          {
            id: 'chunk-id',
            ordinal: chunk.ordinal ?? 0,
            text: '검색할 청크',
            tokenCount: chunk.tokenCount ?? 3,
            sources: chunk.sources ?? [],
            terms,
          },
        ],
      }),
    ).toBe(false)
  })
})
