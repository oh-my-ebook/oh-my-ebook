import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../../test/promise-controller'

const { createPaddle, postprocessWithKiwi, predict } = vi.hoisted(() => ({
  createPaddle: vi.fn(),
  postprocessWithKiwi: vi.fn(),
  predict: vi.fn(),
}))

vi.mock('@paddleocr/paddleocr-js', () => ({ PaddleOCR: { create: createPaddle } }))
vi.mock('../kiwi/client', () => ({ postprocessWithKiwi }))

import { recognizePdfPage } from './page-recognition'

describe('recognizePdfPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('중단하면 PDF 렌더링을 취소하고 OCR 후처리를 시작하지 않는다', async () => {
    const context = { font: '', measureText: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )
    const controller = new AbortController()
    const renderCompletion = createPromiseController<void>()
    const cancel = vi.fn(() => renderCompletion.reject(controller.signal.reason))
    const render = vi.fn(() => ({ promise: renderCompletion.promise, cancel }))
    const page = {
      getViewport: vi.fn(() => ({ width: 1_000, height: 1_500, rotation: 0 })),
      render,
    }

    const recognition = recognizePdfPage(page, controller.signal)
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce())
    controller.abort()

    await expect(recognition).rejects.toBe(controller.signal.reason)
    expect(cancel).toHaveBeenCalledOnce()
    expect(createPaddle).not.toHaveBeenCalled()
    expect(postprocessWithKiwi).not.toHaveBeenCalled()
  })

  it('PDF를 200 DPI로 그려 PaddleOCR와 Kiwi 결과를 좌표에 맞춘다', async () => {
    const context = {
      font: '',
      measureText: vi.fn(() => ({ width: 200 })),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )
    predict.mockResolvedValue([
      {
        items: [
          {
            text: ' OCR 문장 ',
            poly: [
              [100, 200],
              [500, 200],
              [500, 240],
              [100, 240],
            ],
          },
        ],
      },
    ])
    createPaddle.mockResolvedValue({ predict })
    postprocessWithKiwi.mockResolvedValue('다듬은 문장')
    const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    const getViewport = vi.fn(() => ({ width: 1_000, height: 1_500, rotation: 0 }))
    const page = { getViewport, render }

    const signal = new AbortController().signal
    const result = await recognizePdfPage(page, signal)

    expect(getViewport).toHaveBeenCalledWith({ scale: 200 / 72 })
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ background: '#ffffff', canvas: expect.any(HTMLCanvasElement) }),
    )
    expect(createPaddle).toHaveBeenCalledWith(
      expect.objectContaining({
        ortOptions: expect.objectContaining({ wasmPaths: '/vendor/ocr/onnxruntime/' }),
      }),
    )
    expect(postprocessWithKiwi).toHaveBeenCalledWith('OCR 문장', signal)
    expect(result).toEqual({
      width: 1_000,
      height: 1_500,
      lines: [
        {
          text: '다듬은 문장',
          x0: 100,
          y0: 200,
          x1: 500,
          y1: 240,
          fontSize: 40,
          scaleX: 2,
        },
      ],
    })
  })
})
