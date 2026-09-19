import { runOcrAnalysis } from './ocr-analysis'
import type { EbookLibraryStore } from '../ebook-library-store'

export function createOcrAnalysisCoordinator() {
  const activeBookIds = new Set<string>()

  async function startOcrAnalysis(bookId: string, store: EbookLibraryStore): Promise<void> {
    if (activeBookIds.has(bookId)) return

    activeBookIds.add(bookId)
    try {
      await runOcrAnalysis(bookId, store)
    } finally {
      activeBookIds.delete(bookId)
    }
  }

  return { startOcrAnalysis }
}
