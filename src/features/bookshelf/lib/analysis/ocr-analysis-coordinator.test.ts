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
    const secondStart = coordinator.startOcrAnalysis('book-id', store)

    expect(runOcrAnalysis).toHaveBeenCalledOnce()

    if (!resolveFirstRun) throw new Error('Missing OCR completion callback')
    resolveFirstRun()
    await firstStart
    await secondStart

    await coordinator.startOcrAnalysis('book-id', store)
    expect(runOcrAnalysis).toHaveBeenCalledTimes(2)
  })

  it('진행 중인 책에 나중에 합류한 호출자도 실행의 실제 결과를 받는다', async () => {
    let resolveFirstRun: ((result: 'completed' | 'failed') => void) | undefined
    const firstRun = new Promise<'completed' | 'failed'>((resolve) => {
      resolveFirstRun = resolve
    })
    runOcrAnalysis.mockReturnValueOnce(firstRun)
    const coordinator = createOcrAnalysisCoordinator()
    const store = {} as never

    // 라이브러리 화면을 나갔다 돌아와 새로 생긴 호출자가, 이미 진행 중인 같은 책의
    // 실행에 합류하는 상황을 재현한다.
    const firstStart = coordinator.startOcrAnalysis('book-id', store)
    const secondStart = coordinator.startOcrAnalysis('book-id', store)

    if (!resolveFirstRun) throw new Error('Missing OCR completion callback')
    resolveFirstRun('failed')

    await expect(firstStart).resolves.toBe('failed')
    await expect(secondStart).resolves.toBe('failed')
    expect(runOcrAnalysis).toHaveBeenCalledOnce()
  })
})
