import { runOcrAnalysis, type OcrAnalysisFailure, type OcrAnalysisResult } from './ocr-analysis'
import type { EbookLibraryStore } from '../ebook-library-store'

export function createOcrAnalysisCoordinator() {
  const activeRuns = new Map<string, Promise<OcrAnalysisResult>>()

  function startOcrAnalysis(
    bookId: string,
    store: EbookLibraryStore,
    onFailure?: (failure: OcrAnalysisFailure) => void,
  ): Promise<OcrAnalysisResult> {
    // 라이브러리 화면을 나갔다 돌아오는 등 다른 호출자가 이미 같은 책을 실행 중이면,
    // 새로 실행을 시작하지 않고 그 실행의 실제 결과를 함께 기다린다.
    const activeRun = activeRuns.get(bookId)
    if (activeRun) return activeRun

    const run = runOcrAnalysis(bookId, store, { onFailure }).finally(() => {
      activeRuns.delete(bookId)
    })
    activeRuns.set(bookId, run)
    return run
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
