import type {
  chunkSourcesTable,
  ocrPagesTable,
  searchChunksTable,
  searchPostingsTable,
  searchTermsTable,
} from '../schema'

type SearchChunkRow = typeof searchChunksTable.$inferSelect
type ChunkSourceRow = typeof chunkSourcesTable.$inferSelect
type SearchTermRow = typeof searchTermsTable.$inferSelect
type SearchPostingRow = typeof searchPostingsTable.$inferSelect
type OcrPageRow = typeof ocrPagesTable.$inferSelect

type SearchChunkFields = Omit<SearchChunkRow, 'bookId' | 'createdAt'>

export type ChunkSource = Omit<ChunkSourceRow, 'id' | 'chunkId'>

export interface SearchChunk extends SearchChunkFields {
  id: string
}

export interface SearchChunkWithSources extends SearchChunk {
  sources: readonly ChunkSource[]
}

export interface SearchTermFrequency {
  term: SearchTermRow['term']
  termFrequency: SearchPostingRow['termFrequency']
}

export interface IndexedSearchChunk extends SearchChunkWithSources {
  terms: readonly SearchTermFrequency[]
}

export interface SearchChunkRecord extends SearchChunk {
  createdAt: SearchChunkRow['createdAt']
}

export interface SearchChunkPage {
  chunks: SearchChunkRecord[]
  total: number
}

export interface ChunkSourceRecord extends ChunkSourceRow {
  id: number
  chunkOrdinal: SearchChunkRow['ordinal']
  pageNumber: OcrPageRow['pageNumber']
}

export interface ChunkSourcePage {
  sources: ChunkSourceRecord[]
  total: number
}

export interface SearchTermRecord extends SearchTermRow {
  id: number
}

export interface SearchTermPage {
  terms: SearchTermRecord[]
  total: number
}

export interface SearchPostingRecord extends SearchPostingRow {
  term: SearchTermRow['term']
  chunkOrdinal: SearchChunkRow['ordinal']
}

export interface SearchPostingPage {
  postings: SearchPostingRecord[]
  total: number
}

export interface SearchIndex {
  bookId: string
  chunks: readonly IndexedSearchChunk[]
}
