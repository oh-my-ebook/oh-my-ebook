import type { EbookStore } from '../../ebook-store'
import type { createOcrRepository } from './ocr.repository'
import {
  isGetStoredOcrPageInput,
  isIdentifier,
  isInitializeOcrPagesInput,
  isListOcrLinesInput,
  isStoreOcrPageInput,
  runValidated,
} from '../validation'

type OcrService = Pick<
  EbookStore,
  | 'initializeOcrPages'
  | 'prepareOcrPagesForRun'
  | 'acquireNextOcrPage'
  | 'storeOcrPage'
  | 'failOcrPage'
  | 'getStoredOcrPage'
  | 'listOcrPages'
  | 'listOcrLines'
  | 'getOcrLinesForChunking'
>

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
