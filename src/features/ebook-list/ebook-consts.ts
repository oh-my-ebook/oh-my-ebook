export const EBOOK_STORE_ERROR_MESSAGES = {
  unsupported: '이 브라우저에서는 로컬 책장을 사용할 수 없습니다.',
  quota: '브라우저 저장 공간이 부족합니다.',
  duplicate: '이미 저장된 PDF입니다.',
  notfound: '책을 찾을 수 없습니다.',
  deleted: '이미 삭제된 PDF입니다.',
  locked: '다른 탭에서 저장소를 사용 중입니다. 다시 시도해 주세요.',
  'storage-failed': '로컬 저장소에 접근하지 못했습니다.',
} as const

export const COMMAND = {
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
  LIST_OCR_LINES: 'listOcrLines',
  GET_STORED_OCR_PAGE: 'getStoredOcrPage',
  LIST_OCR_PAGES: 'listOcrPages',
  GET_OCR_LINES_FOR_CHUNKING: 'getOcrLinesForChunking',
  STORE_SEARCH_CHUNKS: 'storeSearchChunks',
} as const

export const OPFS_COMMAND = {
  WRITE_PDF: 'writePdf',
  READ_PDF: 'readPdf',
  DELETE_PDF: 'deletePdf',
} as const
