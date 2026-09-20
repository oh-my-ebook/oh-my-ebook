import { runOcrAnalysis, type OcrAnalysisFailure } from './ocr-analysis'
import type { EbookLibraryStore } from '../ebook-library-store'

export function createOcrAnalysisCoordinator() {
  const activeBookIds = new Set<string>()

  async function startOcrAnalysis(
    bookId: string,
    store: EbookLibraryStore,
    onFailure?: (failure: OcrAnalysisFailure) => void,
  ): Promise<void> {
    if (activeBookIds.has(bookId)) return

    activeBookIds.add(bookId)
    try {
      await runOcrAnalysis(bookId, store, { onFailure })
    } finally {
      activeBookIds.delete(bookId)
    }
  }

  return { startOcrAnalysis }
}
