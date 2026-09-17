import { afterEach, describe, expect, it, vi } from 'vitest'
import { postprocessWithKiwi } from './client'

describe('postprocessWithKiwi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('실제 Kiwi Worker 파일을 불러온다', () => {
    const workerUrls: URL[] = []
    class WorkerStub {
      onerror = null
      onmessage = null

      constructor(url: URL) {
        workerUrls.push(url)
      }

      postMessage() {}
    }
    vi.stubGlobal('Worker', WorkerStub)

    void postprocessWithKiwi('OCR 문장')

    expect(String(workerUrls[0])).toContain('/features/reader/workers/kiwi.worker.ts')
  })
})
