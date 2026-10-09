import type { EbookStore } from '@/lib/ebook-storage/ebook-store'

export type BookshelfStore = Pick<
  EbookStore,
  | 'initialize'
  | 'listBooks'
  | 'saveBook'
  | 'getBook'
  | 'deleteBook'
  | 'clearStorage'
  | 'hasBook'
  | 'updateTitle'
  | 'updateCover'
  | 'retryBookAnalysis'
  | 'initializeOcrPages'
  | 'prepareOcrPagesForRun'
  | 'acquireNextOcrPage'
  | 'listOcrPages'
  | 'getOcrLinesForChunking'
  | 'storeSearchIndex'
  | 'storeOcrPage'
  | 'failOcrPage'
  | 'failBookAnalysis'
>
