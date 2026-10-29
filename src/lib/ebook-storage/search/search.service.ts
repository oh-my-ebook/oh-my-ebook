import type {
  SearchChunkPage,
  SearchTermPage,
  SearchPostingPage,
  ChunkSourcePage,
  SearchIndex,
  SearchChunkQuery,
  SearchChunkResult,
} from '../types/search'
import type { createSearchRepository } from './search.repository'
import { isSearchChunkQuery, isSearchIndex, runValidated } from '../validation'

export interface SearchService {
  storeSearchIndex(searchIndex: SearchIndex): Promise<void>
  listSearchChunks({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchChunkPage>
  searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]>
  listSearchTerms({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchTermPage>
  listSearchPostings({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchPostingPage>
  listChunkSources({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<ChunkSourcePage>
}

export function createSearchService(
  searchRepository: ReturnType<typeof createSearchRepository>,
): SearchService {
  const searchService: SearchService = {
    storeSearchIndex: (searchIndex) =>
      runValidated(
        'storeSearchIndex',
        searchRepository.storeSearchIndex,
        searchIndex,
        isSearchIndex,
      ),
    listSearchChunks: (searchChunkQuery) => searchRepository.listSearchChunks(searchChunkQuery),
    searchChunks: (query) =>
      runValidated('searchChunks', searchRepository.searchChunks, query, isSearchChunkQuery),
    listSearchTerms: (searchTermQuery) => searchRepository.listSearchTerms(searchTermQuery),
    listSearchPostings: (searchPostingQuery) =>
      searchRepository.listSearchPostings(searchPostingQuery),
    listChunkSources: (chunkSourceQuery) => searchRepository.listChunkSources(chunkSourceQuery),
  }
  return searchService
}
