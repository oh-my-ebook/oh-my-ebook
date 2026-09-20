import { afterEach, describe, expect, it, vi } from 'vitest'

interface WorkerRequest {
  id: number
  type: 'postprocess' | 'extract-search-terms'
  text: string
}

interface WorkerResponse {
  id: number
  ok: boolean
  type: WorkerRequest['type']
  text?: string
  terms?: Array<{ term: string; termFrequency: number }>
}

describe('postprocessWithKiwi', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('실제 Kiwi Worker에 요청하고 응답을 반환한다', async () => {
    const workerUrls: URL[] = []
    class WorkerStub {
      onerror = null
      onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null

      constructor(url: URL) {
        workerUrls.push(url)
      }

      postMessage({ id, text, type }: WorkerRequest) {
        this.onmessage?.(
          new MessageEvent('message', {
            data: { id, ok: true, type, text: `${text} 후처리` },
          }),
        )
      }
    }
    vi.stubGlobal('Worker', WorkerStub)
    const { postprocessWithKiwi } = await import('./client')

    await expect(postprocessWithKiwi('OCR 문장', new AbortController().signal)).resolves.toBe(
      'OCR 문장 후처리',
    )
    expect(String(workerUrls[0])).toContain('/workers/kiwi.worker.ts')
  })

  it('검색 term 추출을 Worker에 요청하고 빈도를 반환한다', async () => {
    class WorkerStub {
      onerror = null
      onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null

      postMessage({ id, type }: WorkerRequest) {
        this.onmessage?.(
          new MessageEvent('message', {
            data: {
              id,
              ok: true,
              type,
              terms: [
                { term: '전자책', termFrequency: 1 },
                { term: '검색', termFrequency: 2 },
              ],
            },
          }),
        )
      }
    }
    vi.stubGlobal('Worker', WorkerStub)
    const { extractSearchTermsWithKiwi } = await import('./client')

    await expect(
      extractSearchTermsWithKiwi('전자책 검색 검색', new AbortController().signal),
    ).resolves.toEqual([
      { term: '전자책', termFrequency: 1 },
      { term: '검색', termFrequency: 2 },
    ])
  })

  it('중단하면 Worker를 종료하고 다음 요청에서 다시 생성한다', async () => {
    const workers: WorkerStub[] = []
    class WorkerStub {
      onerror = null
      onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
      terminate = vi.fn()

      constructor() {
        workers.push(this)
      }

      postMessage({ id, text, type }: WorkerRequest) {
        if (workers.length > 1) {
          this.onmessage?.(
            new MessageEvent('message', {
              data: { id, ok: true, type, text: `${text} 후처리` },
            }),
          )
        }
      }
    }
    vi.stubGlobal('Worker', WorkerStub)
    const { postprocessWithKiwi } = await import('./client')
    const controller = new AbortController()
    const firstRejection = postprocessWithKiwi('오래된 첫 문장', controller.signal).catch(
      (error: unknown) => error,
    )
    const secondRejection = postprocessWithKiwi('오래된 둘째 문장', controller.signal).catch(
      (error: unknown) => error,
    )

    controller.abort()

    await expect(firstRejection).resolves.toBe(controller.signal.reason)
    await expect(secondRejection).resolves.toBe(controller.signal.reason)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    await expect(postprocessWithKiwi('새 문장', new AbortController().signal)).resolves.toBe(
      '새 문장 후처리',
    )
    expect(workers).toHaveLength(2)
  })
})
