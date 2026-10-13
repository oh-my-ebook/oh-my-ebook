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
  storeSearchIndex(input: StoreSearchIndexInput): Promise<void>
  listSearchChunks(input: ListOcrLinesInput): Promise<SearchChunkPage>
  searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]>
  listSearchTerms(input: ListOcrLinesInput): Promise<SearchTermPage>
  listSearchPostings(input: ListOcrLinesInput): Promise<SearchPostingPage>
  listChunkSources(input: ListOcrLinesInput): Promise<ChunkSourcePage>
}

export function createSearchService(
  searchRepository: ReturnType<typeof createSearchRepository>,
): SearchService {
  return {
    storeSearchIndex: (input) =>
      runValidated(
        'storeSearchIndex',
        searchRepository.storeSearchIndex,
        input,
        isStoreSearchIndexInput,
      ),
    listSearchChunks: (input) =>
      runValidated(
        'listSearchChunks',
        searchRepository.listSearchChunks,
        input,
        isListOcrLinesInput,
      ),
    searchChunks: (query) =>
      runValidated('searchChunks', searchRepository.searchChunks, query, isSearchChunkQuery),
    listSearchTerms: (input) =>
      runValidated('listSearchTerms', searchRepository.listSearchTerms, input, isListOcrLinesInput),
    listSearchPostings: (input) =>
      runValidated(
        'listSearchPostings',
        searchRepository.listSearchPostings,
        input,
        isListOcrLinesInput,
      ),
    listChunkSources: (input) =>
      runValidated(
        'listChunkSources',
        searchRepository.listChunkSources,
        input,
        isListOcrLinesInput,
      ),
  }
}
