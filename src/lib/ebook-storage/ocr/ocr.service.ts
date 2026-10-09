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
  initializeOcrPages(input: InitializeOcrPagesInput): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(input: StoreOcrPageInput): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  getStoredOcrPage(input: GetStoredOcrPageInput): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines(input: ListOcrLinesInput): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
}

export function createOcrService(
  ocrRepository: ReturnType<typeof createOcrRepository>,
): OcrService {
  return {
    initializeOcrPages: (input) =>
      runValidated(
        'initializeOcrPages',
        ocrRepository.initializeOcrPages,
        input,
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
    storeOcrPage: (input) =>
      runValidated('storeOcrPage', ocrRepository.storeOcrPage, input, isStoreOcrPageInput),
    failOcrPage: (pageId) =>
      runValidated('failOcrPage', ocrRepository.failOcrPage, pageId, isIdentifier),
    getStoredOcrPage: (input) =>
      runValidated(
        'getStoredOcrPage',
        ocrRepository.getStoredOcrPage,
        input,
        isGetStoredOcrPageInput,
      ),
    listOcrPages: (bookId) =>
      runValidated('listOcrPages', ocrRepository.listOcrPages, bookId, isIdentifier),
    listOcrLines: (input) =>
      runValidated('listOcrLines', ocrRepository.listOcrLines, input, isListOcrLinesInput),
    getOcrLinesForChunking: (bookId) =>
      runValidated(
        'getOcrLinesForChunking',
        ocrRepository.getOcrLinesForChunking,
        bookId,
        isIdentifier,
      ),
  }
}
