import { isSearchChunkQuery, isSearchIndex, runValidated } from '../validation'
import type { SearchRepository } from './search-repository.types'

export type SearchService = SearchRepository

export function createSearchService(searchRepository: SearchRepository): SearchService {
  const searchService: SearchService = {
    storeSearchIndex: (searchIndex) =>
      runValidated(
        'storeSearchIndex',
        (index) => searchRepository.storeSearchIndex(index),
        searchIndex,
        isSearchIndex,
      ),
    listSearchChunks: (searchChunkQuery) => searchRepository.listSearchChunks(searchChunkQuery),
    searchChunks: (query) =>
      runValidated(
        'searchChunks',
        (chunkQuery) => searchRepository.searchChunks(chunkQuery),
        query,
        isSearchChunkQuery,
      ),
    listSearchTerms: (searchTermQuery) => searchRepository.listSearchTerms(searchTermQuery),
    listSearchPostings: (searchPostingQuery) =>
      searchRepository.listSearchPostings(searchPostingQuery),
    listChunkSources: (chunkSourceQuery) => searchRepository.listChunkSources(chunkSourceQuery),
  }
  return searchService
}
