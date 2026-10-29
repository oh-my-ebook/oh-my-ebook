// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { renderPdfPageForOcr } from './render-page-image'

afterEach(() => vi.restoreAllMocks())

function createPage() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
  const render = vi.fn((_parameters: { canvas: HTMLCanvasElement }) => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }))
  return {
    getViewport: vi.fn(() => ({ width: 1000, height: 1500, rotation: 0 })),
    render,
  }
}

it('PDF를 160 DPI PNG 바이트로 변환하고 Canvas를 정리한다', async () => {
  const page = createPage()
  const bytes = new Uint8Array([137, 80, 78, 71])
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(
      Object.assign(new Blob([bytes], { type: 'image/png' }), {
        arrayBuffer: async () => bytes.buffer,
      }),
    ),
  )

  const result = await renderPdfPageForOcr(page, new AbortController().signal)

  expect(result).toEqual({ bytes, mimeType: 'image/png', width: 1000, height: 1500 })
  expect(page.getViewport).toHaveBeenCalledWith({ scale: 160 / 72 })
  const canvas = page.render.mock.calls[0]?.[0].canvas
  expect(canvas.width).toBe(0)
  expect(canvas.height).toBe(0)
})

it('PDF 렌더링 중 취소하면 렌더링을 중단하고 Canvas를 정리한다', async () => {
  const page = createPage()
  const pending = createPromiseController<void>()
  const controller = new AbortController()
  const cancel = vi.fn(() => pending.reject(controller.signal.reason))
  page.render.mockReturnValueOnce({ promise: pending.promise, cancel })
  const rendering = renderPdfPageForOcr(page, controller.signal)

  controller.abort()

  await expect(rendering).rejects.toBe(controller.signal.reason)
  expect(cancel).toHaveBeenCalledOnce()
  const canvas = page.render.mock.calls[0]?.[0].canvas
  expect(canvas.width).toBe(0)
  expect(canvas.height).toBe(0)
})
