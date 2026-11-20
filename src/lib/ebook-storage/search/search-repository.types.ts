import type {
  ChunkSourcePage,
  SearchChunkPage,
  SearchChunkQuery,
  SearchChunkResult,
  SearchIndex,
  SearchPostingPage,
  SearchTermPage,
} from '../types/search'

export interface SearchPageQuery {
  bookId: string
  limit: number
  offset: number
}

export interface SearchRepository {
  storeSearchIndex(searchIndex: SearchIndex): Promise<void>
  listSearchChunks(query: SearchPageQuery): Promise<SearchChunkPage>
  searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]>
  listSearchTerms(query: SearchPageQuery): Promise<SearchTermPage>
  listSearchPostings(query: SearchPageQuery): Promise<SearchPostingPage>
  listChunkSources(query: SearchPageQuery): Promise<ChunkSourcePage>
}
