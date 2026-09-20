import { describe, expect, it, vi } from 'vitest'

const { runOcrAnalysis } = vi.hoisted(() => ({ runOcrAnalysis: vi.fn() }))

vi.mock('./ocr-analysis', () => ({ runOcrAnalysis }))

import { createOcrAnalysisCoordinator } from './ocr-analysis-coordinator'

describe('createOcrAnalysisCoordinator', () => {
  it('같은 책의 실행이 끝날 때까지 중복 OCR 실행을 막는다', async () => {
    let resolveFirstRun: (() => void) | undefined
    const firstRun = new Promise<void>((resolve) => {
      resolveFirstRun = resolve
    })
    runOcrAnalysis.mockReturnValueOnce(firstRun).mockResolvedValueOnce(undefined)
    const coordinator = createOcrAnalysisCoordinator()
    const store = {} as never

    const firstStart = coordinator.startOcrAnalysis('book-id', store)
    await coordinator.startOcrAnalysis('book-id', store)

    expect(runOcrAnalysis).toHaveBeenCalledOnce()

    if (!resolveFirstRun) throw new Error('Missing OCR completion callback')
    resolveFirstRun()
    await firstStart

    await coordinator.startOcrAnalysis('book-id', store)
    expect(runOcrAnalysis).toHaveBeenCalledTimes(2)
  })
})
