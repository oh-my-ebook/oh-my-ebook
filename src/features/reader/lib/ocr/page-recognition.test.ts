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

// 좌우 페이지 줄이 y좌표 순으로 번갈아 나오는 양면 캡처 인식 결과
function createSpreadItems() {
  const item = (text: string, x0: number, y0: number, x1: number, y1: number) => ({
    text,
    poly: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
  })
  return [
    item('왼쪽 1', 100, 100, 900, 120),
    item('오른쪽 1', 1_100, 110, 1_900, 130),
    item('왼쪽 2', 100, 140, 900, 160),
    item('오른쪽 2', 1_100, 150, 1_900, 170),
  ]
}

function createSpreadPage() {
  return {
    getViewport: vi.fn(() => ({ width: 2_000, height: 1_000, rotation: 0 })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  }
}

function mockMeasuringContext() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: vi.fn(() => ({ width: 100 })),
  } as unknown as CanvasRenderingContext2D)
}

describe('recognizePdfPage', () => {
  // page-recognition 모듈은 PaddleOCR 인스턴스를 모듈 스코프에 캐시한다.
  // 캐시 재사용·해제를 검증하는 테스트가 서로 영향을 주지 않도록 모듈을 매번 새로 불러온다.
  let prepareOcr: typeof import('./page-recognition').prepareOcr
  let recognizePdfPage: typeof import('./page-recognition').recognizePdfPage

  beforeEach(async () => {
    vi.resetModules()
    ;({ prepareOcr, recognizePdfPage } = await import('./page-recognition'))
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

  it('PDF를 160 DPI로 그려 PaddleOCR와 Kiwi 결과를 좌표에 맞춘다', async () => {
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

    expect(getViewport).toHaveBeenCalledWith({ scale: 160 / 72 })
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
    expect(createPaddle.mock.calls[0]?.[0].ortOptions).not.toHaveProperty('numThreads')
    expect(predict).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({ textDetLimitSideLen: 1_216, textDetLimitType: 'max' }),
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

  it('페이지 인식 전에 PaddleOCR와 Kiwi 초기화를 함께 시작한다', async () => {
    createPaddle.mockResolvedValue({ predict, dispose: vi.fn().mockResolvedValue(undefined) })
    postprocessWithKiwi.mockResolvedValue('')

    await prepareOcr()

    expect(createPaddle).toHaveBeenCalledOnce()
    expect(postprocessWithKiwi).toHaveBeenCalledWith('', expect.any(AbortSignal))
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

  it('양면 페이지의 OCR 줄을 읽기 순서로 Kiwi에 넘기고 좌표를 유지한다', async () => {
    mockMeasuringContext()
    predict.mockResolvedValue([{ items: createSpreadItems() }])
    createPaddle.mockResolvedValue({ predict })
    postprocessWithKiwi.mockImplementation(async (text: string) => text)

    const signal = new AbortController().signal
    const { lines } = await recognizePdfPage(createSpreadPage(), signal)

    expect(postprocessWithKiwi).toHaveBeenCalledWith('왼쪽 1\n왼쪽 2\n오른쪽 1\n오른쪽 2', signal)
    expect(lines.map(({ text, x0, y0 }) => ({ text, x0, y0 }))).toEqual([
      { text: '왼쪽 1', x0: 100, y0: 100 },
      { text: '왼쪽 2', x0: 100, y0: 140 },
      { text: '오른쪽 1', x0: 1_100, y0: 110 },
      { text: '오른쪽 2', x0: 1_100, y0: 150 },
    ])
  })
})

describe('recognizePdfPageRaw', () => {
  let recognizePdfPageRaw: typeof import('./page-recognition').recognizePdfPageRaw

  beforeEach(async () => {
    vi.resetModules()
    ;({ recognizePdfPageRaw } = await import('./page-recognition'))
  })

  afterEach(() => vi.restoreAllMocks())

  // 저장된 줄 순서가 리더의 선택 순서와 검색 청크 순서를 모두 결정한다.
  it('양면 페이지의 OCR 줄을 읽기 순서로 정렬해 돌려준다', async () => {
    mockMeasuringContext()
    predict.mockResolvedValue([{ items: createSpreadItems() }])
    createPaddle.mockResolvedValue({ predict })

    const { lines } = await recognizePdfPageRaw(createSpreadPage(), new AbortController().signal)

    expect(lines.map(({ text }) => text)).toEqual(['왼쪽 1', '왼쪽 2', '오른쪽 1', '오른쪽 2'])
  })
})
describe('공유 PaddleOCR 인스턴스', () => {
  // Reader의 실시간 인식과 백그라운드 분석 파이프라인이 같은 PaddleOCR 인스턴스를 공유한다.
  let recognizePdfPage: typeof import('./page-recognition').recognizePdfPage
  let recognizePdfPageRaw: typeof import('./page-recognition').recognizePdfPageRaw

  beforeEach(async () => {
    vi.resetModules()
    ;({ recognizePdfPage, recognizePdfPageRaw } = await import('./page-recognition'))
  })

  afterEach(() => vi.restoreAllMocks())

  it('다른 요청이 같은 인스턴스를 아직 쓰고 있으면 중단해도 인스턴스를 정리하지 않는다', async () => {
    const stuckPredict = createPromiseController<never>()
    const backgroundPredict = createPromiseController<[{ items: never[] }]>()
    predict.mockReturnValueOnce(stuckPredict.promise).mockReturnValueOnce(backgroundPredict.promise)
    const dispose = vi.fn().mockResolvedValue(undefined)
    createPaddle.mockResolvedValue({ predict, dispose })

    // Reader가 화면에 보이는 페이지를 실시간으로 인식한다.
    const readerController = new AbortController()
    const readerRecognition = recognizePdfPage(createOcrPage(), readerController.signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(1))

    // 그 사이 백그라운드 분석 파이프라인이 같은 인스턴스로 다른 페이지를 인식 중이다.
    const backgroundRecognition = recognizePdfPageRaw(createOcrPage(), new AbortController().signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(2))

    // Reader에서 페이지를 넘기거나 나가면서 자신의 요청만 중단한다.
    readerController.abort()
    await expect(readerRecognition).rejects.toBe(readerController.signal.reason)

    // 백그라운드 요청이 아직 같은 인스턴스를 쓰고 있으므로 정리하면 안 된다.
    expect(dispose).not.toHaveBeenCalled()

    backgroundPredict.resolve([{ items: [] }])
    await expect(backgroundRecognition).resolves.toMatchObject({ lines: [] })
    expect(createPaddle).toHaveBeenCalledOnce()
    expect(dispose).not.toHaveBeenCalled()
  })
})
