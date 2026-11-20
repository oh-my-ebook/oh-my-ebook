import type { EbookStore } from '@shared/lib/ebook-storage/ebook-store'

export type OcrConsoleStore = Pick<
  EbookStore,
  | 'listBooks'
  | 'listOcrLines'
  | 'listOcrPages'
  | 'listSearchChunks'
  | 'listChunkSources'
  | 'listSearchTerms'
  | 'listSearchPostings'
  | 'getBookAnalysisStatus'
>
