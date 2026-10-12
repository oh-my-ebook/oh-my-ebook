import type {
  NextOcrPage,
  StoredOcrPage,
  OcrPageRecord,
  OcrLinePage,
  OcrLineForChunking,
  OcrPageResult,
  OcrPageQuery,
} from '../types/ocr'
import type { BookPageMetadata, BookRecordsQuery } from '../types/book'
import type { createOcrRepository } from './ocr.repository'
import {
  isOcrPageQuery,
  isIdentifier,
  isBookPageMetadata,
  isBookRecordsQuery,
  isOcrPageResult,
  runValidated,
} from '../validation'

export interface OcrService {
  initializeOcrPages(bookMetadata: BookPageMetadata): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(ocrPage: OcrPageResult): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines(ocrLineQuery: BookRecordsQuery): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
}

export function createOcrService(
  ocrRepository: ReturnType<typeof createOcrRepository>,
): OcrService {
  const ocrService: OcrService = {
    initializeOcrPages: (bookMetadata) =>
      runValidated(
        'initializeOcrPages',
        ocrRepository.initializeOcrPages,
        bookMetadata,
        isBookPageMetadata,
      ),
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
    listOcrLines: (ocrLineQuery) =>
      runValidated('listOcrLines', ocrRepository.listOcrLines, ocrLineQuery, isBookRecordsQuery),
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
