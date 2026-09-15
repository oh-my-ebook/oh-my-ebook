import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import type { PdfDocumentHandle } from '../lib/pdf-document'
import { PdfViewport } from './pdf-viewport'

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

function createPdfPage(renderTasks: ReturnType<typeof createRenderTask>[]) {
  const pendingRenderTasks = [...renderTasks]
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 900 * scale,
    rotation: 0,
  }))
  const render = vi.fn(() => {
    const renderTask = pendingRenderTasks.shift()
    if (!renderTask) {
      throw new Error('렌더링 작업이 준비되지 않았습니다.')
    }
    return renderTask.task
  })

  return { getViewport, page: { getViewport, render }, render }
}

function createPdfDocument(page: ReturnType<typeof createPdfPage>['page']) {
  const getPage = vi.fn(async () => page)
  const document = { numPages: 1, getPage } satisfies PdfDocumentHandle
  return { document, getPage }
}

function getRenderedCanvas() {
  const canvas = screen.getByRole('img', { name: 'PDF 1페이지' })
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('PDF 페이지가 Canvas로 표시되지 않았습니다.')
  }
  return canvas
}

describe('PdfViewport', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 2)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('한 페이지를 CSS 표시 크기와 DPR 픽셀 크기로 구분해 그린다', async () => {
    const renderTask = createRenderTask()
    const page = createPdfPage([renderTask])
    const { document, getPage } = createPdfDocument(page.page)
    const { container } = render(
      <PdfViewport
        document={document}
        page={{ pageNumber: 1, width: 800, height: 1200, rotation: 0 }}
        scale={1}
      />,
    )

    expect(screen.getByRole('status', { name: 'PDF 1페이지 표시 중' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'PDF 1페이지' })).not.toBeInTheDocument()

    await waitFor(() => expect(page.render).toHaveBeenCalledOnce())
    const canvas = container.querySelector('canvas')
    expect(canvas).toHaveStyle({ width: '800px', height: '1200px' })
    expect(canvas).toHaveAttribute('width', '1600')
    expect(canvas).toHaveAttribute('height', '2400')
    expect(getPage).toHaveBeenCalledWith(1)
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 96 / 72 })
    expect(page.render).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas,
        transform: [2, 0, 0, 2, 0, 0],
      }),
    )

    await act(async () => {
      renderTask.completion.resolve(undefined)
      await renderTask.completion.promise
    })

    expect(getRenderedCanvas()).toBe(canvas)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('표시 크기가 바뀌면 이전 작업을 취소하고 늦은 완료를 무시한다', async () => {
    const firstRender = createRenderTask()
    const latestRender = createRenderTask()
    const page = createPdfPage([firstRender, latestRender])
    const { document } = createPdfDocument(page.page)
    const pdfPage = { pageNumber: 1, width: 800, height: 1200, rotation: 0 }
    const { container, rerender } = render(
      <PdfViewport document={document} page={pdfPage} scale={1} />,
    )
    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))
    const firstCanvas = container.querySelector('canvas')

    rerender(<PdfViewport document={document} page={pdfPage} scale={0.5} />)

    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(2))
    const latestCanvas = container.querySelector('canvas')
    expect(firstRender.task.cancel).toHaveBeenCalledOnce()
    expect(latestCanvas).not.toBe(firstCanvas)
    expect(latestCanvas).toHaveStyle({ width: '400px', height: '600px' })

    await act(async () => {
      latestRender.completion.resolve(undefined)
      await latestRender.completion.promise
    })
    await act(async () => {
      firstRender.completion.resolve(undefined)
      await firstRender.completion.promise
    })

    expect(getRenderedCanvas()).toBe(latestCanvas)
    expect(getRenderedCanvas()).toHaveStyle({ width: '400px', height: '600px' })
  })

  it('취소한 이전 작업의 늦은 오류를 현재 화면에 표시하지 않는다', async () => {
    const firstRender = createRenderTask()
    const latestRender = createRenderTask()
    const page = createPdfPage([firstRender, latestRender])
    const { document } = createPdfDocument(page.page)
    const pdfPage = { pageNumber: 1, width: 800, height: 1200, rotation: 0 }
    const { rerender } = render(<PdfViewport document={document} page={pdfPage} scale={1} />)
    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(1))

    rerender(<PdfViewport document={document} page={pdfPage} scale={0.5} />)
    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(2))
    await act(async () => {
      latestRender.completion.resolve(undefined)
      await latestRender.completion.promise
    })
    await act(async () => {
      firstRender.completion.reject(new Error('이전 작업 실패'))
      await firstRender.completion.promise.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getRenderedCanvas()).toHaveStyle({ width: '400px', height: '600px' })
  })

  it('페이지 표시 실패를 안내하고 같은 페이지를 다시 그린다', async () => {
    const user = userEvent.setup()
    const failedRender = createRenderTask()
    const retryRender = createRenderTask()
    const page = createPdfPage([failedRender, retryRender])
    const { document } = createPdfDocument(page.page)
    render(
      <PdfViewport
        document={document}
        page={{ pageNumber: 1, width: 800, height: 1200, rotation: 0 }}
        scale={1}
      />,
    )
    await waitFor(() => expect(page.render).toHaveBeenCalledOnce())

    await act(async () => {
      failedRender.completion.reject(new Error('render failed'))
      await failedRender.completion.promise.catch(() => undefined)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('1페이지를 표시하지 못했습니다.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(screen.getByRole('status', { name: 'PDF 1페이지 표시 중' })).toBeInTheDocument()
    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(2))

    await act(async () => {
      retryRender.completion.resolve(undefined)
      await retryRender.completion.promise
    })

    expect(getRenderedCanvas()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
