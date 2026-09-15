import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './app'
import { Reader } from './features/reader/components/reader'
import type {
  LoadedPdfDocument,
  PdfDocumentHandle,
  PdfDocumentLoader,
} from './features/reader/lib/pdf-document'
import { createPromiseController } from './test/promise-controller'

const loadPdfDocumentMock = vi.hoisted(() => vi.fn<PdfDocumentLoader>())

vi.mock('./features/reader/lib/pdf-document', async (importOriginal) => {
  const pdfDocument = await importOriginal<typeof import('./features/reader/lib/pdf-document')>()
  return { ...pdfDocument, loadPdfDocument: loadPdfDocumentMock }
})

const resizeNotifications: Array<() => void> = []

function createLoadedDocument(pageCount = 5) {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 900 * scale,
      rotation: 0,
    }),
    render: renderPage,
  }
  const getPage = vi.fn(async () => page)
  const document = { numPages: pageCount, getPage } satisfies PdfDocumentHandle
  const loadedDocument = {
    document,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      width: 800,
      height: 1200,
      rotation: 0,
    })),
  } satisfies LoadedPdfDocument

  return { loadedDocument }
}

function resizeReaderTo(width: number, height: number) {
  const readerArea = screen.getByRole('main', { name: 'PDF 읽기 영역' })
  Object.defineProperty(readerArea, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(readerArea, 'clientHeight', { configurable: true, value: height })
  readerArea.style.paddingLeft = '24px'
  readerArea.style.paddingRight = '24px'
  readerArea.style.paddingTop = '24px'
  readerArea.style.paddingBottom = '24px'
  const notifyResize = resizeNotifications.at(-1)
  if (!notifyResize) {
    throw new Error('Reader 크기 관찰이 시작되지 않았습니다.')
  }
  act(notifyResize)
}

describe('App', () => {
  beforeEach(() => {
    loadPdfDocumentMock.mockReset()
    resizeNotifications.length = 0
    vi.stubGlobal('devicePixelRatio', 1)

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeNotifications.push(() => callback([], this))
      }

      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('첫 페이지 전체를 읽기 영역에 맞추고 영역 크기가 바뀌면 다시 계산한다', async () => {
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    const { loadedDocument } = createLoadedDocument()
    loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
    render(<App />)

    expect(screen.getByRole('heading', { name: '기본 PDF 리더 샘플' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'PDF 불러오는 중' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '페이지 위치' })).not.toBeInTheDocument()
    resizeReaderTo(848, 948)

    await act(async () => {
      documentLoad.resolve(loadedDocument)
      await documentLoad.promise
    })

    const firstPage = await screen.findByRole('img', { name: 'PDF 1페이지' })
    expect(firstPage).toHaveStyle({ width: '600px', height: '900px' })
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')

    resizeReaderTo(1048, 1248)

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toHaveStyle({
        width: '800px',
        height: '1200px',
      })
    })
  })

  it('제목이 없으면 파일명을 표시하고 키보드 focus에서 전체 이름을 보여준다', async () => {
    const user = userEvent.setup()
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
    render(<Reader url="/samples/아주%20긴%20문서명.pdf" />)
    const title = screen.getByRole('heading', { name: '아주 긴 문서명.pdf' })

    await user.tab()

    expect(title).toHaveFocus()
    expect(
      await screen.findByText('아주 긴 문서명.pdf', {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).toBeVisible()
  })

  it('좁은 화면에서도 문서 오류와 재시도를 제공하고 로딩 중 페이지 번호를 숨긴다', async () => {
    const user = userEvent.setup()
    const failedLoad = createPromiseController<LoadedPdfDocument>()
    const retryLoad = createPromiseController<LoadedPdfDocument>()
    const { loadedDocument } = createLoadedDocument()
    loadPdfDocumentMock
      .mockReturnValueOnce(failedLoad.promise)
      .mockReturnValueOnce(retryLoad.promise)
    render(<App />)
    resizeReaderTo(320, 640)

    await act(async () => {
      failedLoad.reject(new Error('network failed'))
      await failedLoad.promise.catch(() => undefined)
    })

    expect(screen.getByRole('alert')).toHaveTextContent('PDF를 불러오지 못했습니다.')
    expect(screen.queryByRole('status', { name: '페이지 위치' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'PDF 다시 불러오기' }))

    expect(screen.getByRole('status', { name: 'PDF 불러오는 중' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '페이지 위치' })).not.toBeInTheDocument()

    await act(async () => {
      retryLoad.resolve(loadedDocument)
      await retryLoad.promise
    })

    expect(await screen.findByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')
  })
})
