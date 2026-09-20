import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import {
  isRenderablePdfPage,
  renderPdfPageImage,
  renderPdfPageToCanvas,
  type RenderablePdfPage,
} from './pdf-page-render'

interface RenderCallParameters {
  canvas: HTMLCanvasElement
  transform?: number[]
}

function createRenderTask() {
  const completion = createPromiseController<void>()
  return {
    completion,
    task: {
      promise: completion.promise,
      cancel: vi.fn(),
    },
  }
}

function createRenderablePage(renderTask: ReturnType<typeof createRenderTask>['task']) {
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 900 * scale,
    rotation: 0,
  }))
  const render = vi.fn((_parameters: RenderCallParameters) => renderTask)
  const page: RenderablePdfPage = { getViewport, render }
  return { page, getViewport, render }
}

function createCanvas() {
  return document.createElement('canvas')
}

describe('isRenderablePdfPage', () => {
  it('render 메서드가 있으면 true를 반환한다', () => {
    const { page } = createRenderablePage(createRenderTask().task)
    expect(isRenderablePdfPage(page)).toBe(true)
  })

  it('render 메서드가 없으면 false를 반환한다', () => {
    const page = { getViewport: vi.fn() }
    expect(isRenderablePdfPage(page)).toBe(false)
  })
})

describe('renderPdfPageToCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 2)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('요청한 배율의 CSS 픽셀 크기로 뷰포트를 구하고, DPR을 반영한 캔버스 크기로 렌더링한다', async () => {
    const { completion, task } = createRenderTask()
    const { page, getViewport, render } = createRenderablePage(task)
    const canvas = createCanvas()

    const resultPromise = renderPdfPageToCanvas(page, canvas, 0.5, new AbortController().signal)
    completion.resolve(undefined)
    await resultPromise

    expect(getViewport).toHaveBeenCalledWith({ scale: (96 / 72) * 0.5 })
    expect(canvas).toHaveAttribute('width', '800')
    expect(canvas).toHaveAttribute('height', '1200')
    expect(canvas).toHaveStyle({ width: '100%', height: '100%' })
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ canvas, transform: [2, 0, 0, 2, 0, 0] }),
    )
  })

  it('DPR이 1이면 transform 없이 렌더링한다', async () => {
    vi.stubGlobal('devicePixelRatio', 1)
    const { completion, task } = createRenderTask()
    const { page, render } = createRenderablePage(task)
    const canvas = createCanvas()

    const resultPromise = renderPdfPageToCanvas(page, canvas, 1, new AbortController().signal)
    completion.resolve(undefined)
    await resultPromise

    expect(render).toHaveBeenCalledWith(expect.objectContaining({ transform: undefined }))
  })

  it('취소 신호를 받으면 렌더 작업을 취소하고 완료 후 오류를 던진다', async () => {
    const { completion, task } = createRenderTask()
    const { page } = createRenderablePage(task)
    const canvas = createCanvas()
    const controller = new AbortController()

    const resultPromise = renderPdfPageToCanvas(page, canvas, 1, controller.signal)
    controller.abort()
    expect(task.cancel).toHaveBeenCalledOnce()

    completion.resolve(undefined)
    await expect(resultPromise).rejects.toThrow()
  })
})

describe('renderPdfPageImage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('이미지 영역만 잘라 PNG로 만든다', async () => {
    const pngBlob = new Blob(['png'], { type: 'image/png' })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(pngBlob),
    )
    // 그린 뒤에는 Canvas 픽셀을 즉시 비우므로 그리는 시점의 크기를 기록한다.
    const renderedSizes: number[][] = []
    const render = vi.fn(({ canvas }: { canvas: HTMLCanvasElement; transform?: number[] }) => {
      renderedSizes.push([canvas.width, canvas.height])
      return { promise: Promise.resolve(), cancel: vi.fn() }
    })
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        rotation: 0,
      })),
      render,
    }

    const blob = await renderPdfPageImage(page, { x0: 50, y0: 100, x1: 250, y1: 200 })

    expect(blob).toBe(pngBlob)
    // 2배로 그리므로 200x100 영역은 400x200 Canvas가 되고, 영역의 왼쪽 위가 원점에 오도록 옮긴다.
    expect(renderedSizes).toEqual([[400, 200]])
    expect(render.mock.calls[0][0].transform).toEqual([1, 0, 0, 1, -100, -200])
  })
})
