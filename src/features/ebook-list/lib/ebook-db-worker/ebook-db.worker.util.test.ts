import { describe, expect, it } from 'vitest'
import { SQLITE_COMMAND } from '../../ebook-consts'
import { isStoreSearchChunksInput, isStoreSearchIndexInput } from './ebook-db.worker.util'

describe('검색 청크 저장 입력 검증', () => {
  it('청크와 페이지별 원본 줄 범위를 허용한다', () => {
    expect(
      isStoreSearchChunksInput({
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
          },
        ],
      }),
    ).toBe(true)
    expect(SQLITE_COMMAND.STORE_SEARCH_CHUNKS).toBe('storeSearchChunks')
  })

  it.each([
    {
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-id',
          ordinal: 0,
          text: '검색할 청크',
          tokenCount: 3,
          sources: [{ ocrPageId: 'page-1', startLineIndex: 2, endLineIndex: 1, sourceOrder: 0 }],
        },
      ],
    },
    {
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-id',
          ordinal: -1,
          text: '검색할 청크',
          tokenCount: 3,
          sources: [],
        },
      ],
    },
    {
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-id',
          ordinal: 0,
          text: '검색할 청크',
          tokenCount: 0,
          sources: [],
        },
      ],
    },
  ])('잘못된 청크 또는 원본 범위를 거부한다', (input) => {
    expect(isStoreSearchChunksInput(input)).toBe(false)
  })
})

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
            sources: [],
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
    { terms: [{ term: '', termFrequency: 1 }] },
    { terms: [{ term: '검색', termFrequency: 0 }] },
    {
      terms: [
        { term: '검색', termFrequency: 1 },
        { term: '검색', termFrequency: 2 },
      ],
    },
  ])('빈 term, 0 이하 빈도, 중복 term을 거부한다', ({ terms }) => {
    expect(
      isStoreSearchIndexInput({
        bookId: 'book-id',
        chunks: [
          {
            id: 'chunk-id',
            ordinal: 0,
            text: '검색할 청크',
            tokenCount: 3,
            sources: [],
            terms,
          },
        ],
      }),
    ).toBe(false)
  })
})
