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

const coordinatorsByStore = new WeakMap<
  EbookLibraryStore,
  ReturnType<typeof createOcrAnalysisCoordinator>
>()

/**
 * 같은 store 인스턴스를 쓰는 화면이 여러 번 마운트돼도(예: Reader로 이동했다가 책장으로 돌아오는 경우)
 * 이미 진행 중인 OCR 분석을 store별로 재사용하는 코디네이터로 추적해 중복 실행을 막는다.
 */
export function getOcrAnalysisCoordinator(store: EbookLibraryStore) {
  let coordinator = coordinatorsByStore.get(store)
  if (!coordinator) {
    coordinator = createOcrAnalysisCoordinator()
    coordinatorsByStore.set(store, coordinator)
  }
  return coordinator
}
