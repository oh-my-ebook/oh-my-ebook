import { expectTypeOf, it } from 'vitest'
import type { EbookStore } from './ebook-store'
import type { StoredBook, StoredBookDetail } from './data/book'
import type { SearchChunkQuery, SearchChunkResult } from './data/search'

it('저장소 메서드는 인수와 반환 타입을 연결한다', () => {
  expectTypeOf<EbookStore['listBooks']>().returns.toEqualTypeOf<Promise<StoredBook[]>>()
  expectTypeOf<EbookStore['getBook']>().returns.toEqualTypeOf<Promise<StoredBookDetail>>()
  expectTypeOf<EbookStore['saveBook']>().returns.toEqualTypeOf<Promise<string>>()
  expectTypeOf<EbookStore['updateProgress']>().returns.toEqualTypeOf<Promise<void>>()
  expectTypeOf<EbookStore['updateProgress']>().parameters.toEqualTypeOf<
    [{ id: string; page: number }]
  >()
  expectTypeOf<EbookStore['searchChunks']>().parameters.toEqualTypeOf<[SearchChunkQuery]>()
  expectTypeOf<EbookStore['searchChunks']>().returns.toEqualTypeOf<Promise<SearchChunkResult[]>>()
  expectTypeOf<{ id: string; page: string }>().not.toExtend<
    Parameters<EbookStore['updateProgress']>[0]
  >()
  expectTypeOf<Promise<number>>().not.toExtend<ReturnType<EbookStore['saveBook']>>()
})
