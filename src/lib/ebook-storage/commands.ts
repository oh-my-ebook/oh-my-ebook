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

export type Command = (typeof COMMAND)[keyof typeof COMMAND]

export type SQLITECommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]

// 사용 가능한 전체 명령어
export type EbookStoreCommand = Command | SQLITECommand

// Client에게 요청 가능한 명령어
export type EbookClientCommand = Exclude<EbookStoreCommand, 'saveBook'>
