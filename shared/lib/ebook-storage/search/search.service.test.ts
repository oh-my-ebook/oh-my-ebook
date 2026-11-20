import { expect, it } from 'vitest'
import { createStoreMock } from '@/test/ebook-store'
import { createSearchService } from './search.service'

it('전달받은 repository 객체의 검색 결과와 페이지 출처를 반환한다', async () => {
  const results = [
    {
      id: 'chunk-id',
      ordinal: 0,
      text: '검색된 문장',
      tokenCount: 4,
      score: 1,
      sources: [{ pageNumber: 1, startLineIndex: 0, endLineIndex: 1 }],
    },
  ]
  const repository = {
    ...createStoreMock(),
    results,
    async searchChunks() {
      return this.results
    },
  }
  const searchService = createSearchService(repository)

  await expect(
    searchService.searchChunks({ bookId: 'book-id', terms: ['검색'], limit: 5 }),
  ).resolves.toEqual(results)
})
