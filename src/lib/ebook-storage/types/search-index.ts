import type { chunkSources, ocrPages, searchChunks, searchPostings, searchTerms } from '../schema'

type SearchChunkRow = typeof searchChunks.$inferSelect
type ChunkSourceRow = typeof chunkSources.$inferSelect
type SearchTermRow = typeof searchTerms.$inferSelect
type SearchPostingRow = typeof searchPostings.$inferSelect
type OcrPageRow = typeof ocrPages.$inferSelect

type SearchChunkFields = Omit<SearchChunkRow, 'bookId' | 'createdAt'>

export type ChunkSourceInput = Omit<ChunkSourceRow, 'id' | 'chunkId'>

export interface SearchChunk extends SearchChunkFields {
  id: string
}

export interface SearchChunkInput extends SearchChunk {
  sources: readonly ChunkSourceInput[]
}

export interface SearchTermFrequencyInput {
  term: SearchTermRow['term']
  termFrequency: SearchPostingRow['termFrequency']
}

export interface SearchIndexChunkInput extends SearchChunkInput {
  terms: readonly SearchTermFrequencyInput[]
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
