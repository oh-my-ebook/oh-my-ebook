import type {
  NextOcrPage,
  StoredOcrPage,
  OcrPageRecord,
  OcrLinePage,
  OcrLineForChunking,
} from '../types/ocr'
import type {
  InitializeOcrPagesInput,
  StoreOcrPageInput,
  ListOcrLinesInput,
  GetStoredOcrPageInput,
} from '../types/inputs'
import type { createOcrRepository } from './ocr.repository'
import {
  isGetStoredOcrPageInput,
  isIdentifier,
  isInitializeOcrPagesInput,
  isListOcrLinesInput,
  isStoreOcrPageInput,
  runValidated,
} from '../validation'

export interface OcrService {
  initializeOcrPages(ocrPagesSetup: InitializeOcrPagesInput): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(ocrPage: StoreOcrPageInput): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  getStoredOcrPage(ocrPageQuery: GetStoredOcrPageInput): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines(ocrLineQuery: ListOcrLinesInput): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
}

export function createOcrService(
  ocrRepository: ReturnType<typeof createOcrRepository>,
): OcrService {
  return {
    initializeOcrPages: (ocrPagesSetup) =>
      runValidated(
        'initializeOcrPages',
        ocrRepository.initializeOcrPages,
        ocrPagesSetup,
        isInitializeOcrPagesInput,
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
      runValidated('storeOcrPage', ocrRepository.storeOcrPage, ocrPage, isStoreOcrPageInput),
    failOcrPage: (pageId) =>
      runValidated('failOcrPage', ocrRepository.failOcrPage, pageId, isIdentifier),
    getStoredOcrPage: (ocrPageQuery) =>
      runValidated(
        'getStoredOcrPage',
        ocrRepository.getStoredOcrPage,
        ocrPageQuery,
        isGetStoredOcrPageInput,
      ),
    listOcrPages: (bookId) =>
      runValidated('listOcrPages', ocrRepository.listOcrPages, bookId, isIdentifier),
    listOcrLines: (ocrLineQuery) =>
      runValidated('listOcrLines', ocrRepository.listOcrLines, ocrLineQuery, isListOcrLinesInput),
    getOcrLinesForChunking: (bookId) =>
      runValidated(
        'getOcrLinesForChunking',
        ocrRepository.getOcrLinesForChunking,
        bookId,
        isIdentifier,
      ),
  }
}
