import type {
  SearchChunkPage,
  SearchTermPage,
  SearchPostingPage,
  ChunkSourcePage,
} from '../types/search-index'
import type { SearchChunkQuery, SearchChunkResult } from '../types/search'
import type { StoreSearchIndexInput, ListOcrLinesInput } from '../types/inputs'
import type { createSearchRepository } from './search.repository'
import {
  isListOcrLinesInput,
  isSearchChunkQuery,
  isStoreSearchIndexInput,
  runValidated,
} from '../validation'

export interface SearchService {
  storeSearchIndex(searchIndex: StoreSearchIndexInput): Promise<void>
  listSearchChunks(searchChunkQuery: ListOcrLinesInput): Promise<SearchChunkPage>
  searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]>
  listSearchTerms(searchTermQuery: ListOcrLinesInput): Promise<SearchTermPage>
  listSearchPostings(searchPostingQuery: ListOcrLinesInput): Promise<SearchPostingPage>
  listChunkSources(chunkSourceQuery: ListOcrLinesInput): Promise<ChunkSourcePage>
}

export function createSearchService(
  searchRepository: ReturnType<typeof createSearchRepository>,
): SearchService {
  return {
    storeSearchIndex: (searchIndex) =>
      runValidated(
        'storeSearchIndex',
        searchRepository.storeSearchIndex,
        searchIndex,
        isStoreSearchIndexInput,
      ),
    listSearchChunks: (searchChunkQuery) =>
      runValidated(
        'listSearchChunks',
        searchRepository.listSearchChunks,
        searchChunkQuery,
        isListOcrLinesInput,
      ),
    searchChunks: (query) =>
      runValidated('searchChunks', searchRepository.searchChunks, query, isSearchChunkQuery),
    listSearchTerms: (searchTermQuery) =>
      runValidated(
        'listSearchTerms',
        searchRepository.listSearchTerms,
        searchTermQuery,
        isListOcrLinesInput,
      ),
    listSearchPostings: (searchPostingQuery) =>
      runValidated(
        'listSearchPostings',
        searchRepository.listSearchPostings,
        searchPostingQuery,
        isListOcrLinesInput,
      ),
    listChunkSources: (chunkSourceQuery) =>
      runValidated(
        'listChunkSources',
        searchRepository.listChunkSources,
        chunkSourceQuery,
        isListOcrLinesInput,
      ),
  }
}
