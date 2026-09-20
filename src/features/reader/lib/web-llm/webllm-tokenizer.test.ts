import { afterEach, expect, it, vi } from 'vitest'

function stubTokenizer() {
  const count = vi.fn((text: string) => new Int32Array(Array.from(text).length))
  const fromJSON = vi.fn(async () => ({ encode: count }))
  vi.doMock('@mlc-ai/web-tokenizers', () => ({ Tokenizer: { fromJSON } }))
  return { fromJSON }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@mlc-ai/web-tokenizers')
  vi.unstubAllGlobals()
})

it('모델 캐시의 토크나이저를 재사용하고 동시 요청도 한 번만 초기화한다', async () => {
  const { fromJSON } = stubTokenizer()
  const data = new ArrayBuffer(4)
  const match = vi.fn(async () => ({ ok: true, arrayBuffer: async () => data }))
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) })
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const { loadWebLlmTokenCounter } = await import('./webllm-tokenizer')

  const [first, second] = await Promise.all([loadWebLlmTokenCounter(), loadWebLlmTokenCounter()])

  expect(first('한글😀')).toBe(3)
  expect(first).toBe(second)
  expect(fromJSON).toHaveBeenCalledExactlyOnceWith(data)
  expect(fetch).not.toHaveBeenCalled()
  expect(match).toHaveBeenCalledWith(
    expect.stringContaining('Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/main/tokenizer.json'),
  )
})

it('다운로드가 실패하면 실패를 전달하고 다음 호출에서 다시 시도한다', async () => {
  stubTokenizer()
  vi.stubGlobal('caches', undefined)
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })
  vi.stubGlobal('fetch', fetch)
  const { loadWebLlmTokenCounter } = await import('./webllm-tokenizer')

  await expect(loadWebLlmTokenCounter()).rejects.toThrow('토크나이저')
  const count = await loadWebLlmTokenCounter()
  expect(count('다시')).toBe(2)
})
