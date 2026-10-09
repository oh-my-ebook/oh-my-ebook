import type { EbookStore } from '../../ebook-store'
import type { createSearchRepository } from './search.repository'
import {
  isListOcrLinesInput,
  isSearchChunkQuery,
  isStoreSearchIndexInput,
  runValidated,
} from '../validation'

type SearchService = Pick<
  EbookStore,
  | 'storeSearchIndex'
  | 'listSearchChunks'
  | 'searchChunks'
  | 'listSearchTerms'
  | 'listSearchPostings'
  | 'listChunkSources'
>

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
