import { runOcrAnalysis, type OcrAnalysisFailure, type OcrAnalysisResult } from './ocr-analysis'
import type { EbookLibraryStore } from '../ebook-library-store'

export function createOcrAnalysisCoordinator() {
  const activeBookIds = new Set<string>()

  async function startOcrAnalysis(
    bookId: string,
    store: EbookLibraryStore,
    onFailure?: (failure: OcrAnalysisFailure) => void,
  ): Promise<OcrAnalysisResult | undefined> {
    if (activeBookIds.has(bookId)) return undefined

    activeBookIds.add(bookId)
    try {
      return await runOcrAnalysis(bookId, store, { onFailure })
    } finally {
      activeBookIds.delete(bookId)
    }
  }

  return { startOcrAnalysis }
}
