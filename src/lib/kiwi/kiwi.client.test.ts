import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KiwiWorkerRequest, KiwiWorkerResponse } from './kiwi.types'

function createWorkerStub() {
  const workers: WorkerStub[] = []

  class WorkerStub {
    readonly url: URL
    readonly requests: KiwiWorkerRequest[] = []
    onmessage: ((event: MessageEvent<KiwiWorkerResponse>) => void) | null = null
    onerror: (() => void) | null = null
    terminate = vi.fn()

    constructor(url: URL) {
      this.url = url
      workers.push(this)
    }

    postMessage(request: KiwiWorkerRequest) {
      this.requests.push(request)
    }

    respond(data: KiwiWorkerResponse) {
      this.onmessage?.(new MessageEvent('message', { data }))
    }

    fail() {
      this.onerror?.()
    }
  }

  vi.stubGlobal('Worker', WorkerStub)

  function getWorker(index = 0) {
    const worker = workers[index]
    if (!worker) throw new Error('Worker was not created')
    return worker
  }

  return { workers, WorkerStub, getWorker }
}

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('KiwiClient', () => {
  it('같은 Worker에서 응답이 역순으로 도착해도 각 요청에 맞는 결과를 전달한다', async () => {
    const { workers, getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const signal = new AbortController().signal

    const normalization = kiwiClient.normalizeText('OCR 문장', signal)
    const extraction = kiwiClient.extractSearchTerms('전자책 검색 검색', signal)
    const worker = getWorker()
    worker.respond({
      id: 2,
      ok: true,
      type: 'extract-search-terms',
      terms: [{ term: '검색', frequency: 2 }],
    })
    worker.respond({ id: 1, ok: true, type: 'normalize-text', text: '정규화한 문장' })

    await expect(normalization).resolves.toBe('정규화한 문장')
    await expect(extraction).resolves.toEqual([{ term: '검색', frequency: 2 }])
    expect(workers).toHaveLength(1)
    expect(String(worker.url)).toContain('/lib/kiwi/kiwi.worker.ts')
    expect(worker.requests).toEqual([
      { id: 1, type: 'normalize-text', text: 'OCR 문장' },
      { id: 2, type: 'extract-search-terms', text: '전자책 검색 검색' },
    ])
  })

  it('이미 중단된 요청은 Worker를 생성하지 않는다', async () => {
    const { workers } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const controller = new AbortController()
    controller.abort()

    await expect(kiwiClient.normalizeText('문장', controller.signal)).rejects.toBe(
      controller.signal.reason,
    )
    expect(workers).toHaveLength(0)
  })

  it('중단하면 모든 대기 요청을 거부하고 다음 요청에서 Worker를 다시 생성한다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const controller = new AbortController()
    const secondController = new AbortController()
    const first = kiwiClient.normalizeText('첫 문장', controller.signal)
    const second = kiwiClient.extractSearchTerms('둘째 문장', secondController.signal)
    const firstRejection = first.catch((error: unknown) => error)
    const secondRejection = second.catch((error: unknown) => error)

    controller.abort()

    await expect(firstRejection).resolves.toBe(controller.signal.reason)
    await expect(secondRejection).resolves.toBe(controller.signal.reason)
    expect(getWorker().terminate).toHaveBeenCalledOnce()

    const next = kiwiClient.normalizeText('새 문장', new AbortController().signal)
    secondController.abort()
    getWorker(1).respond({ id: 3, ok: true, type: 'normalize-text', text: '새 문장' })
    await expect(next).resolves.toBe('새 문장')
    expect(getWorker(1).terminate).not.toHaveBeenCalled()
  })

  it('완료된 요청의 취소 신호는 다른 요청을 중단하지 않는다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const controller = new AbortController()
    const completed = kiwiClient.normalizeText('완료된 문장', controller.signal)
    getWorker().respond({ id: 1, ok: true, type: 'normalize-text', text: '완료된 문장' })
    await completed

    const pending = kiwiClient.normalizeText('다음 문장', new AbortController().signal)
    controller.abort()
    getWorker().respond({ id: 2, ok: true, type: 'normalize-text', text: '다음 문장' })

    await expect(pending).resolves.toBe('다음 문장')
    expect(getWorker().terminate).not.toHaveBeenCalled()
  })

  it('Worker 실행 오류를 모든 요청에 전달하고 다음 요청에서 다시 생성한다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const signal = new AbortController().signal
    const first = kiwiClient.normalizeText('문장', signal)
    const second = kiwiClient.extractSearchTerms('검색어', signal)
    const firstRejection = expect(first).rejects.toThrow(
      '현재 Kiwi worker에서 오류가 발생했습니다.',
    )
    const secondRejection = expect(second).rejects.toThrow(
      '현재 Kiwi worker에서 오류가 발생했습니다.',
    )

    getWorker().fail()

    await Promise.all([firstRejection, secondRejection])
    expect(getWorker().terminate).toHaveBeenCalledOnce()
    const next = kiwiClient.extractSearchTerms('검색어', signal)
    getWorker(1).respond({ id: 3, ok: true, type: 'extract-search-terms', terms: [] })
    await expect(next).resolves.toEqual([])
  })

  it('Client별로 Worker를 관리해 한 Client의 취소가 다른 Client에 영향을 주지 않는다', async () => {
    const { getWorker } = createWorkerStub()
    const { KiwiClient } = await import('./kiwi.client')
    const firstClient = new KiwiClient()
    const secondClient = new KiwiClient()
    const controller = new AbortController()
    const first = firstClient.normalizeText('첫 문장', controller.signal)
    const firstRejection = first.catch((error: unknown) => error)
    const second = secondClient.normalizeText('둘째 문장', new AbortController().signal)

    controller.abort()
    getWorker(1).respond({ id: 1, ok: true, type: 'normalize-text', text: '둘째 문장' })

    await expect(firstRejection).resolves.toBe(controller.signal.reason)
    await expect(second).resolves.toBe('둘째 문장')
    expect(getWorker(1).terminate).not.toHaveBeenCalled()
  })

  it('요청 타입이 다른 응답을 거부한다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const result = kiwiClient.normalizeText('문장', new AbortController().signal)

    getWorker().respond({ id: 1, ok: true, type: 'extract-search-terms', terms: [] })

    await expect(result).rejects.toThrow('Kiwi Worker 응답 타입이 요청과 다릅니다.')
  })

  it('대기 중인 요청이 없는 응답은 무시하고 해당 요청의 응답을 기다린다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const result = kiwiClient.normalizeText('문장', new AbortController().signal)

    getWorker().respond({ id: 99, ok: true, type: 'normalize-text', text: '다른 요청' })
    getWorker().respond({ id: 1, ok: true, type: 'normalize-text', text: '정규화한 문장' })

    await expect(result).resolves.toBe('정규화한 문장')
  })

  it('완료된 요청의 중복 응답은 새 요청에 영향을 주지 않는다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const signal = new AbortController().signal
    const completed = kiwiClient.normalizeText('문장', signal)
    getWorker().respond({ id: 1, ok: true, type: 'normalize-text', text: '정규화한 문장' })
    await completed

    const pending = kiwiClient.extractSearchTerms('검색어', signal)
    getWorker().respond({ id: 1, ok: true, type: 'normalize-text', text: '중복 응답' })
    getWorker().respond({
      id: 2,
      ok: true,
      type: 'extract-search-terms',
      terms: [{ term: '검색어', frequency: 2 }],
    })

    await expect(pending).resolves.toEqual([{ term: '검색어', frequency: 2 }])
  })

  it('분석 오류를 전달하고 실패한 요청의 취소 신호가 다음 요청에 영향을 주지 않는다', async () => {
    const { getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const controller = new AbortController()
    const failed = kiwiClient.normalizeText('문장', controller.signal)
    getWorker().respond({ id: 1, ok: false, type: 'normalize-text', error: '분석 실패' })
    await expect(failed).rejects.toThrow('분석 실패')

    const next = kiwiClient.normalizeText('새 문장', new AbortController().signal)
    controller.abort()
    getWorker().respond({ id: 2, ok: true, type: 'normalize-text', text: '새 문장' })
    await expect(next).resolves.toBe('새 문장')
    expect(getWorker().terminate).not.toHaveBeenCalled()
  })

  it('메시지 전송 실패 시 요청과 취소 구독을 정리한다', async () => {
    const { WorkerStub, getWorker } = createWorkerStub()
    const { kiwiClient } = await import('./kiwi.client')
    const error = new Error('전송 실패')
    vi.spyOn(WorkerStub.prototype, 'postMessage').mockImplementationOnce(() => {
      throw error
    })
    const controller = new AbortController()

    await expect(kiwiClient.normalizeText('문장', controller.signal)).rejects.toBe(error)
    controller.abort()

    expect(getWorker().terminate).not.toHaveBeenCalled()
    const next = kiwiClient.normalizeText('다음 문장', new AbortController().signal)
    getWorker().respond({ id: 2, ok: true, type: 'normalize-text', text: '다음 문장' })
    await expect(next).resolves.toBe('다음 문장')
  })
})
