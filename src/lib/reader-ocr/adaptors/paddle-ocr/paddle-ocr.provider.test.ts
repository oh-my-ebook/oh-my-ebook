import { afterEach, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@paddleocr/paddleocr-js')
})

it('해제한 초기화가 늦게 실패해도 새 엔진을 유지한다', async () => {
  const engine = { predict: vi.fn(), dispose: vi.fn() }
  const initialization = createPromiseController<typeof engine>()
  const create = vi.fn(async () => engine)
  create.mockReturnValueOnce(initialization.promise)
  vi.doMock('@paddleocr/paddleocr-js', () => ({ PaddleOCR: { create } }))
  const { PaddleOcrProvider } = await import('./paddle-ocr.provider')
  const provider = new PaddleOcrProvider()
  const previous = provider.getInstance()
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
  provider.abandon(previous)
  const current = provider.getInstance()
  await expect(current).resolves.toBe(engine)

  initialization.reject(new Error('이전 초기화 실패'))
  await expect(previous).rejects.toThrow('이전 초기화 실패')

  await expect(provider.getInstance()).resolves.toBe(engine)
  expect(create).toHaveBeenCalledTimes(2)
  expect(engine.dispose).not.toHaveBeenCalled()
})
