import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../../test/promise-controller'

const { createPaddle, postprocessWithKiwi, predict } = vi.hoisted(() => ({
  createPaddle: vi.fn(),
  postprocessWithKiwi: vi.fn(),
  predict: vi.fn(),
}))

vi.mock('@paddleocr/paddleocr-js', () => ({ PaddleOCR: { create: createPaddle } }))
vi.mock('@/lib/kiwi/client', () => ({ postprocessWithKiwi }))

function createOcrPage() {
  const context = { font: '', measureText: vi.fn(() => ({ width: 200 })) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  const getViewport = vi.fn(() => ({ width: 1_000, height: 1_500, rotation: 0 }))
  return { getViewport, render }
}

describe('recognizePdfPage', () => {
  // page-recognition 모듈은 PaddleOCR 인스턴스를 모듈 스코프에 캐시한다.
  // 캐시 재사용·해제를 검증하는 테스트가 서로 영향을 주지 않도록 모듈을 매번 새로 불러온다.
  let recognizePdfPage: typeof import('./page-recognition').recognizePdfPage

  beforeEach(async () => {
    vi.resetModules()
    ;({ recognizePdfPage } = await import('./page-recognition'))
  })

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
    const { getViewport, render } = createOcrPage()
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
    createPaddle.mockResolvedValue({ predict, dispose: vi.fn().mockResolvedValue(undefined) })
    postprocessWithKiwi.mockResolvedValue('다듬은 문장')
    const page = { getViewport, render }

    const signal = new AbortController().signal
    const result = await recognizePdfPage(page, signal)

    expect(getViewport).toHaveBeenCalledWith({ scale: 200 / 72 })
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ background: '#ffffff', canvas: expect.any(HTMLCanvasElement) }),
    )
    expect(createPaddle).toHaveBeenCalledWith(
      expect.objectContaining({
        ortOptions: expect.objectContaining({
          wasmPaths: '/src/assets/vendor/ocr/runtime/',
        }),
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

  it('중단하면 실행 중인 PaddleOCR 인식을 기다리지 않고 즉시 실패한다', async () => {
    const page = createOcrPage()
    const stuckPredict = createPromiseController<never>()
    predict.mockReturnValueOnce(stuckPredict.promise)
    createPaddle.mockResolvedValue({ predict, dispose: vi.fn().mockResolvedValue(undefined) })
    const controller = new AbortController()

    const recognition = recognizePdfPage(page, controller.signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledOnce())
    controller.abort()

    await expect(recognition).rejects.toBe(controller.signal.reason)
  })

  it('중단된 페이지의 PaddleOCR 인스턴스는 정리된다', async () => {
    const page = createOcrPage()
    const stuckPredict = createPromiseController<never>()
    predict.mockReturnValueOnce(stuckPredict.promise)
    const dispose = vi.fn().mockResolvedValue(undefined)
    createPaddle.mockResolvedValue({ predict, dispose })
    const controller = new AbortController()

    const recognition = recognizePdfPage(page, controller.signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledOnce())
    controller.abort()
    await expect(recognition).rejects.toBe(controller.signal.reason)

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
  })

  it('중단 후 다음 페이지는 새 PaddleOCR 인스턴스로 즉시 인식을 시작한다', async () => {
    const stuckPage = createOcrPage()
    const stuckPredict = createPromiseController<never>()
    predict.mockReturnValueOnce(stuckPredict.promise)
    createPaddle.mockResolvedValue({ predict, dispose: vi.fn().mockResolvedValue(undefined) })
    const firstController = new AbortController()

    const firstRecognition = recognizePdfPage(stuckPage, firstController.signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledOnce())
    firstController.abort()
    await expect(firstRecognition).rejects.toBe(firstController.signal.reason)

    const nextPage = createOcrPage()
    predict.mockResolvedValueOnce([{ items: [] }])
    postprocessWithKiwi.mockResolvedValue('')

    await recognizePdfPage(nextPage, new AbortController().signal)

    expect(createPaddle).toHaveBeenCalledTimes(2)
  })

  it('중단 없이 이어지는 페이지는 같은 PaddleOCR 인스턴스를 재사용한다', async () => {
    createPaddle.mockResolvedValue({ predict, dispose: vi.fn().mockResolvedValue(undefined) })
    predict.mockResolvedValue([{ items: [] }])
    postprocessWithKiwi.mockResolvedValue('')

    await recognizePdfPage(createOcrPage(), new AbortController().signal)
    await recognizePdfPage(createOcrPage(), new AbortController().signal)

    expect(createPaddle).toHaveBeenCalledTimes(1)
  })

  it('PaddleOCR 초기화 도중 중단해도 초기화가 끝난 뒤 인스턴스를 정리한다', async () => {
    const page = createOcrPage()
    const initialization = createPromiseController<{
      predict: typeof predict
      dispose: () => Promise<void>
    }>()
    createPaddle.mockReturnValueOnce(initialization.promise)
    const controller = new AbortController()

    const recognition = recognizePdfPage(page, controller.signal)
    await vi.waitFor(() => expect(createPaddle).toHaveBeenCalledOnce())
    controller.abort()
    await expect(recognition).rejects.toBe(controller.signal.reason)

    const dispose = vi.fn().mockResolvedValue(undefined)
    initialization.resolve({ predict, dispose })

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
  })

  it('렌더링 직후 PaddleOCR 호출 전의 좁은 틈에서 중단돼도 처리되지 않은 예외를 남기지 않는다', async () => {
    // dispose()가 호출되면 진행 중이던 predict() 요청을 실제 라이브러리처럼 거부시킨다.
    const stuckPredict = createPromiseController<never>()
    const dispose = vi.fn(() => {
      stuckPredict.reject(new Error('Worker transport client has been disposed.'))
      return Promise.resolve()
    })
    // PaddleOCR 인스턴스를 미리 캐시해 둔다. 이후 중단이 이 인스턴스를 그대로 정리한다.
    createPaddle.mockResolvedValue({ predict, dispose })
    predict.mockResolvedValueOnce([{ items: [] }])
    postprocessWithKiwi.mockResolvedValue('')
    await recognizePdfPage(createOcrPage(), new AbortController().signal)

    predict.mockReturnValueOnce(stuckPredict.promise)

    const { getViewport } = createOcrPage()
    const renderCompletion = createPromiseController<void>()
    const render = vi.fn(() => ({ promise: renderCompletion.promise, cancel: vi.fn() }))
    const page = { getViewport, render }
    const controller = new AbortController()

    const recognition = recognizePdfPage(page, controller.signal)
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce())

    // 렌더링이 끝난 직후, PaddleOCR 호출로 이어지기 전의 microtask 틈에서 중단한다.
    // controller.abort()가 queueMicrotask로 미뤄지므로, signal.reason은 recognition이
    // 정리된 뒤에 읽어야 abort 전 값(undefined)을 비교하는 실수를 피할 수 있다.
    renderCompletion.resolve()
    queueMicrotask(() => controller.abort())

    const rejection = await recognition.catch((error: unknown) => error)
    expect(rejection).toBe(controller.signal.reason)
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
  })
})
