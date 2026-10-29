import type {
  NextOcrPage,
  StoredOcrPage,
  OcrPageRecord,
  OcrLinePage,
  OcrLineForChunking,
  OcrPageResult,
  OcrPageQuery,
} from '../types/ocr'
import type { createOcrRepository } from './ocr.repository'
import { isOcrPageQuery, isIdentifier, isOcrPageResult, runValidated } from '../validation'

export interface OcrService {
  initializeOcrPages(bookId: string): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(ocrPage: OcrPageResult): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
}

export function createOcrService(
  ocrRepository: ReturnType<typeof createOcrRepository>,
): OcrService {
  const ocrService: OcrService = {
    initializeOcrPages: (bookId) =>
      runValidated('initializeOcrPages', ocrRepository.initializeOcrPages, bookId, isIdentifier),
    prepareOcrPagesForRun: (bookId) =>
      runValidated(
        'prepareOcrPagesForRun',
        ocrRepository.prepareOcrPagesForRun,
        bookId,
        isIdentifier,
      ),
    acquireNextOcrPage: (bookId) =>
      runValidated('acquireNextOcrPage', ocrRepository.acquireNextOcrPage, bookId, isIdentifier),
    storeOcrPage: (ocrPage) =>
      runValidated('storeOcrPage', ocrRepository.storeOcrPage, ocrPage, isOcrPageResult),
    failOcrPage: (pageId) =>
      runValidated('failOcrPage', ocrRepository.failOcrPage, pageId, isIdentifier),
    getStoredOcrPage: (ocrPageQuery) =>
      runValidated(
        'getStoredOcrPage',
        ocrRepository.getStoredOcrPage,
        ocrPageQuery,
        isOcrPageQuery,
      ),
    listOcrPages: (bookId) =>
      runValidated('listOcrPages', ocrRepository.listOcrPages, bookId, isIdentifier),
    listOcrLines: (ocrLineQuery) => ocrRepository.listOcrLines(ocrLineQuery),
    getOcrLinesForChunking: (bookId) =>
      runValidated(
        'getOcrLinesForChunking',
        ocrRepository.getOcrLinesForChunking,
        bookId,
        isIdentifier,
      ),
  }
  return ocrService
}
