export interface ChunkSourceInput {
  ocrPageId: string
  startLineIndex: number
  endLineIndex: number
  sourceOrder: number
}

export interface SearchChunkInput {
  id: string
  ordinal: number
  text: string
  tokenCount: number
  sources: readonly ChunkSourceInput[]
}

export interface SearchTermFrequencyInput {
  term: string
  termFrequency: number
}

export interface SearchIndexChunkInput extends SearchChunkInput {
  terms: readonly SearchTermFrequencyInput[]
}

export interface SearchChunkRecord {
  id: string
  ordinal: number
  text: string
  token_count: number
  created_at: number
}

export interface SearchChunkPage {
  chunks: SearchChunkRecord[]
  total: number
}

export interface ChunkSourceRecord {
  id: number
  chunk_id: string
  chunk_ordinal: number
  ocr_page_id: string
  page_number: number
  start_line_index: number
  end_line_index: number
  source_order: number
}

export interface ChunkSourcePage {
  sources: ChunkSourceRecord[]
  total: number
}

export interface SearchTermRecord {
  id: number
  term: string
  document_frequency: number
}

export interface SearchTermPage {
  terms: SearchTermRecord[]
  total: number
}

export interface SearchPostingRecord {
  term_id: number
  chunk_id: string
  term_frequency: number
  term: string
  chunk_ordinal: number
}

export interface SearchPostingPage {
  postings: SearchPostingRecord[]
  total: number
}
