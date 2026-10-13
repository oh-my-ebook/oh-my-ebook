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

export interface SearchChunkResult {
  id: string
  ordinal: number
  text: string
  tokenCount: number
  score: number
  sources: readonly SearchChunkSource[]
}
