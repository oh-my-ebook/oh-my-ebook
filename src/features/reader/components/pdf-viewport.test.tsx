import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import type { PdfDocumentHandle, PdfPageHandle, PdfPageInfo } from '../lib/pdf-document'
import { PdfViewport } from './pdf-viewport'

const { recognizePdfPage } = vi.hoisted(() => ({ recognizePdfPage: vi.fn() }))

vi.mock('../lib/ocr/page-recognition', () => ({ recognizePdfPage }))

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

function createPdfDocument(pages: ReadonlyMap<number, PdfPageHandle>) {
  const getPage = vi.fn(async (pageNumber: number) => {
    const page = pages.get(pageNumber)
    if (!page) {
      throw new Error(`Missing page ${pageNumber}`)
    }
    return page
  })
  const document = { numPages: pages.size, getPage } satisfies PdfDocumentHandle
  return { document, getPage }
}

function createPageInfo(pageNumber: number): PdfPageInfo {
  return { pageNumber, width: 800, height: 1200, rotation: 0 }
}

function getRenderedCanvas(pageNumber = 1) {
  const canvas = screen.getByRole('img', { name: `PDF ${pageNumber}페이지` })
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('PDF 페이지가 Canvas로 표시되지 않았습니다.')
  }
  return canvas
}

describe('PdfViewport', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 2)
    recognizePdfPage.mockResolvedValue({ height: 1, lines: [], width: 1 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('page와 pages를 동시에 전달하지 못하게 한다', () => {
    const { document } = createPdfDocument(new Map())
    const page = createPageInfo(1)
    const props = { document, page, pages: [page], scale: 1 }

    // @ts-expect-error page와 pages는 동시에 전달할 수 없다.
    expect(<PdfViewport {...props} />).toBeDefined()
  })

  it('한 페이지를 CSS 표시 크기와 DPR 픽셀 크기로 구분해 그린다', async () => {
    const renderTask = createRenderTask()
    const page = createPdfPage([renderTask])
    const { document, getPage } = createPdfDocument(new Map([[1, page.page]]))
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
    expect(container.querySelector('[data-slot="pdf-page-frame"]')).toHaveStyle({
      width: '800px',
      height: '1200px',
    })
    expect(canvas).toHaveStyle({ width: '100%', height: '100%' })
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

  it('200 DPI OCR 결과를 드래그 가능한 텍스트 레이어로 겹친다', async () => {
    const renderTask = createRenderTask()
    const page = createPdfPage([renderTask])
    const { document } = createPdfDocument(new Map([[1, page.page]]))
    recognizePdfPage.mockResolvedValueOnce({
      width: 1_200,
      height: 1_800,
      lines: [
        {
          text: '형태소로 다듬은 문장',
          x0: 120,
          y0: 180,
          x1: 600,
          y1: 216,
          fontSize: 36,
          scaleX: 1.25,
        },
      ],
    })

    const { container } = render(
      <PdfViewport document={document} page={createPageInfo(1)} scale={1} />,
    )

    await act(async () => {
      renderTask.completion.resolve(undefined)
      await renderTask.completion.promise
    })

    const layer = await screen.findByLabelText('PDF 1페이지 OCR 텍스트 레이어')
    const line = screen.getByText('형태소로 다듬은 문장')
    expect(recognizePdfPage).toHaveBeenCalledWith(page.page, expect.any(AbortSignal))
    expect(layer).toBeInTheDocument()
    expect(line).toHaveClass('cursor-text', 'select-text', 'text-transparent')
    expect(line).toHaveStyle({
      left: '10%',
      top: '10%',
      fontSize: '3cqw',
      transform: 'scaleX(1.25)',
    })
    expect(container.querySelector('[data-slot="pdf-page-frame"]')).toHaveClass(
      '[container-type:inline-size]',
    )
  })

  it('표시 크기가 바뀌면 이전 작업을 취소하고 늦은 완료를 무시한다', async () => {
    const firstRender = createRenderTask()
    const latestRender = createRenderTask()
    const page = createPdfPage([firstRender, latestRender])
    const { document } = createPdfDocument(new Map([[1, page.page]]))
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
    expect(container.querySelector('[data-slot="pdf-page-frame"]')).toHaveStyle({
      width: '400px',
      height: '600px',
    })
    expect(latestCanvas).toHaveStyle({ width: '100%', height: '100%' })

    await act(async () => {
      latestRender.completion.resolve(undefined)
      await latestRender.completion.promise
    })
    await act(async () => {
      firstRender.completion.resolve(undefined)
      await firstRender.completion.promise
    })

    expect(getRenderedCanvas()).toBe(latestCanvas)
    expect(getRenderedCanvas()).toHaveStyle({ width: '100%', height: '100%' })
  })

  it('배율 변경을 200ms 동안 전환하고 동작 감소 설정에서는 전환하지 않는다', async () => {
    const firstRender = createRenderTask()
    const latestRender = createRenderTask()
    const page = createPdfPage([firstRender, latestRender])
    const { document } = createPdfDocument(new Map([[1, page.page]]))
    const pdfPage = { pageNumber: 1, width: 800, height: 1200, rotation: 0 }
    const { container, rerender } = render(
      <PdfViewport document={document} page={pdfPage} scale={1} />,
    )
    await waitFor(() => expect(page.render).toHaveBeenCalledOnce())
    const pageFrame = container.querySelector('[data-slot="pdf-page-frame"]')

    expect(pageFrame).toHaveClass(
      'transition-[width,height]',
      'duration-200',
      'ease-out',
      'motion-reduce:transition-none',
    )
    expect(pageFrame).toHaveStyle({ width: '800px', height: '1200px' })

    rerender(<PdfViewport document={document} page={pdfPage} scale={0.5} />)

    expect(container.querySelector('[data-slot="pdf-page-frame"]')).toBe(pageFrame)
    expect(pageFrame).toHaveStyle({ width: '400px', height: '600px' })
  })

  it('취소한 이전 작업의 늦은 오류를 현재 화면에 표시하지 않는다', async () => {
    const firstRender = createRenderTask()
    const latestRender = createRenderTask()
    const page = createPdfPage([firstRender, latestRender])
    const { document } = createPdfDocument(new Map([[1, page.page]]))
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
    expect(getRenderedCanvas()).toHaveStyle({ width: '100%', height: '100%' })
  })

  it('페이지 표시 실패를 안내하고 같은 페이지를 다시 그린다', async () => {
    const user = userEvent.setup()
    const failedRender = createRenderTask()
    const retryRender = createRenderTask()
    const page = createPdfPage([failedRender, retryRender])
    const { document } = createPdfDocument(new Map([[1, page.page]]))
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

  it('최대 두 페이지가 모두 준비된 뒤 Canvas와 완료 상태를 표시한다', async () => {
    const firstRender = createRenderTask()
    const secondRender = createRenderTask()
    const ignoredRender = createRenderTask()
    const firstPage = createPdfPage([firstRender])
    const secondPage = createPdfPage([secondRender])
    const ignoredPage = createPdfPage([ignoredRender])
    const { document, getPage } = createPdfDocument(
      new Map([
        [1, firstPage.page],
        [2, secondPage.page],
        [3, ignoredPage.page],
      ]),
    )
    const onStatusChange = vi.fn()
    const { container } = render(
      <PdfViewport
        document={document}
        onStatusChange={onStatusChange}
        pages={[createPageInfo(1), createPageInfo(2), createPageInfo(3)]}
        scale={1}
      />,
    )

    expect(screen.getByRole('status', { name: 'PDF 1–2페이지 표시 중' })).toBeInTheDocument()
    await waitFor(() => {
      expect(firstPage.render).toHaveBeenCalledOnce()
      expect(secondPage.render).toHaveBeenCalledOnce()
    })
    expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 1, 2])
    expect(ignoredPage.render).not.toHaveBeenCalled()
    expect(container.querySelectorAll('canvas')).toHaveLength(2)
    const frames = container.querySelectorAll('[data-slot="pdf-page-frame"]')
    expect(frames).toHaveLength(2)
    expect(frames[0]).toHaveStyle({ width: '800px', height: '1200px' })
    expect(frames[1]).toHaveStyle({ width: '800px', height: '1200px' })
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(onStatusChange).toHaveBeenCalledWith('loading')

    await act(async () => {
      firstRender.completion.resolve(undefined)
      await firstRender.completion.promise
    })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(onStatusChange).not.toHaveBeenCalledWith('ready')

    await act(async () => {
      secondRender.completion.resolve(undefined)
      await secondRender.completion.promise
    })

    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(getRenderedCanvas(1)).toBeInTheDocument()
    expect(getRenderedCanvas(2)).toBeInTheDocument()
    expect(onStatusChange).toHaveBeenLastCalledWith('ready')
  })

  it('두 페이지 중 한쪽이 실패하면 다른 작업을 취소하고 전체 실패를 알린다', async () => {
    const firstRender = createRenderTask()
    const failedRender = createRenderTask()
    const firstPage = createPdfPage([firstRender])
    const secondPage = createPdfPage([failedRender])
    const { document } = createPdfDocument(
      new Map([
        [1, firstPage.page],
        [2, secondPage.page],
      ]),
    )
    const onStatusChange = vi.fn()
    render(
      <PdfViewport
        document={document}
        onStatusChange={onStatusChange}
        pages={[createPageInfo(1), createPageInfo(2)]}
        scale={1}
      />,
    )
    await waitFor(() => {
      expect(firstPage.render).toHaveBeenCalledOnce()
      expect(secondPage.render).toHaveBeenCalledOnce()
    })

    await act(async () => {
      failedRender.completion.reject(new Error('second page failed'))
      await failedRender.completion.promise.catch(() => undefined)
    })

    expect(firstRender.task.cancel).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert')).toHaveTextContent('1–2페이지를 표시하지 못했습니다.')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(onStatusChange).toHaveBeenLastCalledWith('error')
  })

  it('보기 변경 시 이전 페이지 작업을 모두 취소하고 늦은 결과를 무시한다', async () => {
    const firstRender = createRenderTask()
    const secondRender = createRenderTask()
    const latestRender = createRenderTask()
    const firstPage = createPdfPage([firstRender])
    const secondPage = createPdfPage([secondRender])
    const latestPage = createPdfPage([latestRender])
    const { document } = createPdfDocument(
      new Map([
        [1, firstPage.page],
        [2, secondPage.page],
        [3, latestPage.page],
      ]),
    )
    const { rerender } = render(
      <PdfViewport document={document} pages={[createPageInfo(1), createPageInfo(2)]} scale={1} />,
    )
    await waitFor(() => {
      expect(firstPage.render).toHaveBeenCalledOnce()
      expect(secondPage.render).toHaveBeenCalledOnce()
    })

    rerender(<PdfViewport document={document} pages={[createPageInfo(3)]} scale={1} />)

    await waitFor(() => expect(latestPage.render).toHaveBeenCalledOnce())
    expect(firstRender.task.cancel).toHaveBeenCalledOnce()
    expect(secondRender.task.cancel).toHaveBeenCalledOnce()

    await act(async () => {
      latestRender.completion.resolve(undefined)
      await latestRender.completion.promise
    })
    await act(async () => {
      firstRender.completion.resolve(undefined)
      secondRender.completion.reject(new Error('stale failure'))
      await Promise.all([
        firstRender.completion.promise,
        secondRender.completion.promise.catch(() => undefined),
      ])
    })

    expect(getRenderedCanvas(3)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'PDF 1페이지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'PDF 2페이지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
