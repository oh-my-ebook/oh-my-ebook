import { afterEach, describe, expect, it, vi } from 'vitest'
import { postprocessWithKiwi } from './client'

interface WorkerRequest {
  id: number
  text: string
}

interface WorkerResponse {
  id: number
  ok: boolean
  text: string
}

describe('postprocessWithKiwi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('실제 Kiwi Worker에 요청하고 응답을 반환한다', async () => {
    const workerUrls: URL[] = []
    class WorkerStub {
      onerror = null
      onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null

      constructor(url: URL) {
        workerUrls.push(url)
      }

      postMessage({ id, text }: WorkerRequest) {
        this.onmessage?.(
          new MessageEvent('message', {
            data: { id, ok: true, text: `${text} 후처리` },
          }),
        )
      }
    }
    vi.stubGlobal('Worker', WorkerStub)

    await expect(postprocessWithKiwi('OCR 문장')).resolves.toBe('OCR 문장 후처리')
    expect(String(workerUrls[0])).toContain('/features/reader/workers/kiwi.worker.ts')
  })
})
