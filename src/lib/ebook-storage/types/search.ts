import type { InferModelFromColumns } from 'drizzle-orm'
import type {
  chunkSourceColumns,
  chunkSourceRecordColumns,
  chunkSourcesTable,
  searchChunkColumns,
  searchChunksTable,
  searchChunkSourceColumns,
  searchPostingRecordColumns,
  searchTermFrequencyColumns,
  searchTermsTable,
} from '../schema/search'

export type SearchChunk = typeof searchChunksTable.$inferSelect
export type ChunkSource = typeof chunkSourcesTable.$inferSelect
export type SearchTerm = typeof searchTermsTable.$inferSelect

export type ChunkSourceRange = Pick<ChunkSource, keyof typeof chunkSourceColumns>

export interface SearchChunkWithSources extends Pick<SearchChunk, keyof typeof searchChunkColumns> {
  sources: readonly ChunkSourceRange[]
}

export type SearchTermFrequency = InferModelFromColumns<typeof searchTermFrequencyColumns>

export interface IndexedSearchChunk extends SearchChunkWithSources {
  terms: readonly SearchTermFrequency[]
}

export interface SearchChunkPage {
  chunks: Omit<SearchChunk, 'bookId'>[]
  total: number
}

export interface ChunkSourcePage {
  sources: InferModelFromColumns<typeof chunkSourceRecordColumns>[]
  total: number
}

export interface SearchTermPage {
  terms: SearchTerm[]
  total: number
}

export interface SearchPostingPage {
  postings: InferModelFromColumns<typeof searchPostingRecordColumns>[]
  total: number
}

export interface SearchIndex {
  bookId: string
  chunks: readonly IndexedSearchChunk[]
}

export interface SearchChunkQuery {
  bookId: string
  terms: readonly string[]
  limit: number
}

export type SearchChunkSource = InferModelFromColumns<typeof searchChunkSourceColumns>

export interface ScoredSearchChunk extends Pick<SearchChunk, keyof typeof searchChunkColumns> {
  score: number
}

export interface SearchChunkResult extends ScoredSearchChunk {
  sources: readonly SearchChunkSource[]
}
