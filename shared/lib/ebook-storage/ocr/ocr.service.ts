import { isOcrPageQuery, isIdentifier, isOcrPageResult, runValidated } from '../validation'
import type { OcrRepository } from './ocr-repository.types'

export type OcrService = OcrRepository

export function createOcrService(ocrRepository: OcrRepository): OcrService {
  const ocrService: OcrService = {
    initializeOcrPages: (bookId) =>
      runValidated(
        'initializeOcrPages',
        (id) => ocrRepository.initializeOcrPages(id),
        bookId,
        isIdentifier,
      ),
    prepareOcrPagesForRun: (bookId) =>
      runValidated(
        'prepareOcrPagesForRun',
        (id) => ocrRepository.prepareOcrPagesForRun(id),
        bookId,
        isIdentifier,
      ),
    acquireNextOcrPage: (bookId) =>
      runValidated(
        'acquireNextOcrPage',
        (id) => ocrRepository.acquireNextOcrPage(id),
        bookId,
        isIdentifier,
      ),
    storeOcrPage: (ocrPage) =>
      runValidated(
        'storeOcrPage',
        (page) => ocrRepository.storeOcrPage(page),
        ocrPage,
        isOcrPageResult,
      ),
    failOcrPage: (pageId) =>
      runValidated('failOcrPage', (id) => ocrRepository.failOcrPage(id), pageId, isIdentifier),
    getStoredOcrPage: (ocrPageQuery) =>
      runValidated(
        'getStoredOcrPage',
        (query) => ocrRepository.getStoredOcrPage(query),
        ocrPageQuery,
        isOcrPageQuery,
      ),
    listOcrPages: (bookId) =>
      runValidated('listOcrPages', (id) => ocrRepository.listOcrPages(id), bookId, isIdentifier),
    listOcrLines: (ocrLineQuery) => ocrRepository.listOcrLines(ocrLineQuery),
    getOcrLinesForChunking: (bookId) =>
      runValidated(
        'getOcrLinesForChunking',
        (id) => ocrRepository.getOcrLinesForChunking(id),
        bookId,
        isIdentifier,
      ),
  }
  return ocrService
}
