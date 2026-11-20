import type {
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrPageQuery,
  OcrPageRecord,
  OcrPageResult,
  StoredOcrPage,
} from '../types/ocr'

export interface OcrRepository {
  initializeOcrPages(bookId: string): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(ocrPage: OcrPageResult): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines(input: { bookId: string; limit: number; offset: number }): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
}
