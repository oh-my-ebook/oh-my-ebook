import type { BookAnalysisStatus } from '../book'

export const COMMAND = {
  CLEAR_STORAGE: 'clearStorage',
  SAVE_BOOK: 'saveBook',
  LIST_BOOKS: 'listBooks',
  GET_BOOK: 'getBook',
  DELETE_BOOK: 'deleteBook',
} as const

export const SQLITE_COMMAND = {
  INITIALIZE: 'initialize',
  HAS_BOOK: 'hasBook',
  UPDATE_TITLE: 'updateTitle',
  UPDATE_PROGRESS: 'updateProgress',
  UPDATE_COVER: 'updateCover',
  INITIALIZE_OCR_PAGES: 'initializeOcrPages',
  PREPARE_OCR_PAGES_FOR_RUN: 'prepareOcrPagesForRun',
  ACQUIRE_NEXT_OCR_PAGE: 'acquireNextOcrPage',
  STORE_OCR_PAGE: 'storeOcrPage',
  FAIL_OCR_PAGE: 'failOcrPage',
  FAIL_BOOK_ANALYSIS: 'failBookAnalysis',
  RETRY_BOOK_ANALYSIS: 'retryBookAnalysis',
  LIST_OCR_LINES: 'listOcrLines',
  GET_STORED_OCR_PAGE: 'getStoredOcrPage',
  LIST_OCR_PAGES: 'listOcrPages',
  GET_BOOK_ANALYSIS_STATUS: 'getBookAnalysisStatus',
  GET_OCR_LINES_FOR_CHUNKING: 'getOcrLinesForChunking',
  STORE_SEARCH_INDEX: 'storeSearchIndex',
  LIST_SEARCH_CHUNKS: 'listSearchChunks',
  LIST_CHUNK_SOURCES: 'listChunkSources',
  LIST_SEARCH_TERMS: 'listSearchTerms',
  LIST_SEARCH_POSTINGS: 'listSearchPostings',
  SEARCH_CHUNKS: 'searchChunks',
} as const

export const OPFS_COMMAND = {
  WRITE_PDF: 'writePdf',
  READ_PDF: 'readPdf',
  DELETE_PDF: 'deletePdf',
} as const

export type Command = (typeof COMMAND)[keyof typeof COMMAND]
export type SQLITECommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]
export type OPFSCommand = (typeof OPFS_COMMAND)[keyof typeof OPFS_COMMAND]

// 사용 가능한 전체 명령어
export type EbookStoreCommand = Command | SQLITECommand | OPFSCommand

// Client에게 요청 가능한 명령어
export type EbookClientCommand = Exclude<
  EbookStoreCommand,
  'saveBook' | 'writePdf' | 'readPdf' | 'deletePdf'
>

export interface EbookWorkerRequest {
  requestId: number
  command: EbookStoreCommand
  payload?: unknown
}

export type EbookStoreResponse =
  { requestId: number; result: unknown } | { requestId: number; error: { code: string } }

export interface OcrLineInput {
  rawText: string
  x0: number
  y0: number
  x1: number
  y1: number
}

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

export interface NextOcrPage {
  id: string
  pageNumber: number
}

export interface OcrLineRecord {
  page_number: number
  line_index: number
  raw_text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrLinePage {
  lines: OcrLineRecord[]
  total: number
}

export interface OcrLineForChunking {
  ocr_page_id: string
  page_number: number
  line_index: number
  raw_text: string
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

export interface StoredOcrPage {
  width: number
  height: number
  lines: OcrLineInput[]
}

export interface OcrPageRecord {
  page_number: number
  status: 'pending' | 'processing' | 'ready' | 'failed'
  width: number | null
  height: number | null
}

export interface AddBookInput {
  pdfData: ArrayBuffer
  contentHash: string
  fileName: string
  title: string
  author: string | null
  pdfTitle: string | null
  pdfSubject: string | null
  pdfKeywords: string | null
  publisher: string | null
  pdfSize: number
  pageCount: number
  coverData: ArrayBuffer | null
  coverMime: 'image/webp' | 'image/png' | null
  coverStatus: 'ready' | 'fallback'
}

export interface StoredBook {
  id: string
  content_hash: string
  file_name: string
  title: string
  author: string | null
  pdf_title: string | null
  pdf_subject: string | null
  pdf_keywords: string | null
  publisher: string | null
  pdf_size: number
  page_count: number
  cover_data: Uint8Array | null
  cover_mime: string | null
  cover_status: 'ready' | 'fallback'
  pdf_status: 'available' | 'missing'
  last_page: number | null
  analysis_status: BookAnalysisStatus
  ocr_completed_at: number | null
  indexed_at: number | null
  created_at: number
  updated_at: number
}
