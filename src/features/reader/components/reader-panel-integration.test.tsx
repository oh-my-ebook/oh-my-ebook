import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import type { LoadedPdfDocument, PdfDocumentHandle, PdfDocumentLoader } from '../lib/pdf-document'
import { Reader } from './reader'

const loadPdfDocumentMock = vi.hoisted(() => vi.fn<PdfDocumentLoader>())

vi.mock('../lib/pdf-document', async (importOriginal) => {
  const pdfDocument = await importOriginal<typeof import('../lib/pdf-document')>()
  return { ...pdfDocument, loadPdfDocument: loadPdfDocumentMock }
})

const PANEL_OPEN_LABEL = '보조 패널 열기'
const PANEL_TITLE = '보조 패널'

let resizeObserveCallback: ResizeObserverCallback | null = null
let mediaQueryMatches = true

function stubResizeObserver() {
  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      resizeObserveCallback = callback
    }

    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return mediaQueryMatches
      },
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

function createLoadedDocument(): LoadedPdfDocument {
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
  const document = { numPages: 1, getPage } satisfies PdfDocumentHandle

  return {
    document,
    pages: [{ pageNumber: 1, width: 800, height: 1200, rotation: 0 }],
  }
}

function resizeReaderAreaTo(width: number, height: number) {
  const readerArea = screen.getByRole('main', { name: 'PDF 읽기 영역' })
  Object.defineProperty(readerArea, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(readerArea, 'clientHeight', { configurable: true, value: height })

  if (!resizeObserveCallback) {
    throw new Error('읽기 영역 관찰이 시작되지 않았습니다.')
  }
  const notifyResize = resizeObserveCallback
  act(() => {
    notifyResize([], {} as ResizeObserver)
  })
}

async function renderLoadedReader() {
  const documentLoad = createPromiseController<LoadedPdfDocument>()
  loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
  render(<Reader url="/sample.pdf" />)
  resizeReaderAreaTo(1000, 1200)

  await act(async () => {
    documentLoad.resolve(createLoadedDocument())
    await documentLoad.promise
  })
  await screen.findByRole('img', { name: 'PDF 1페이지' })
}

describe('Reader 보조 패널 연결', () => {
  beforeEach(() => {
    loadPdfDocumentMock.mockReset()
    resizeObserveCallback = null
    mediaQueryMatches = true
    vi.stubGlobal('devicePixelRatio', 1)
    stubResizeObserver()
    stubMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('넓은 화면에서 패널을 열면 본문 옆 영역이 표시되고, 닫으면 열기 버튼으로 포커스가 복원된다', async () => {
    const user = userEvent.setup()
    mediaQueryMatches = true
    await renderLoadedReader()

    const panelButton = screen.getByRole('button', { name: PANEL_OPEN_LABEL })
    await user.click(panelButton)

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PANEL_OPEN_LABEL })).toHaveFocus()
  })

  it('좁은 화면에서 패널을 열면 Sheet로 표시되고, 닫으면 열기 버튼으로 포커스가 복원된다', async () => {
    const user = userEvent.setup()
    mediaQueryMatches = false
    await renderLoadedReader()

    const panelButton = screen.getByRole('button', { name: PANEL_OPEN_LABEL })
    await user.click(panelButton)

    expect(screen.getByRole('dialog', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PANEL_OPEN_LABEL })).toHaveFocus()
  })

  it('패널이 열린 상태에서도 읽기 영역 크기 변화가 본문 배율에 반영된다', async () => {
    const user = userEvent.setup()
    await renderLoadedReader()
    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    resizeReaderAreaTo(400, 600)

    const firstPage = await screen.findByRole('img', { name: 'PDF 1페이지' })
    expect(firstPage).toHaveStyle({ width: '400px', height: '600px' })
  })
})
