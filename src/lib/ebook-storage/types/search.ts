import type { SearchChunk } from './search-index'

export interface SearchChunkQuery {
  bookId: string
  terms: readonly string[]
  limit: number
}

export interface SearchChunkSource {
  pageNumber: number
  startLineIndex: number
  endLineIndex: number
}

export interface ScoredSearchChunk extends SearchChunk {
  score: number
}

export interface SearchChunkResult extends ScoredSearchChunk {
  sources: readonly SearchChunkSource[]
}
