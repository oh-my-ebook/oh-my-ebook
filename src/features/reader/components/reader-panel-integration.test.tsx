import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

// mock 상태를 모듈 전역 let 대신 각 테스트가 직접 만드는 팩토리로 캡슐화해, beforeEach 초기화
// 누락으로 테스트 간 상태가 새는 걸 원천적으로 막는다.
function setupResizeObserverMock() {
  let resizeCallback: ResizeObserverCallback | null = null

  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback
    }

    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)

  return {
    resizeReaderAreaTo(width: number, height: number) {
      const readerArea = screen.getByRole('main', { name: 'PDF 읽기 영역' })
      Object.defineProperty(readerArea, 'clientWidth', { configurable: true, value: width })
      Object.defineProperty(readerArea, 'clientHeight', { configurable: true, value: height })
      vi.spyOn(readerArea, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, width, height),
      )

      if (!resizeCallback) {
        throw new Error('읽기 영역 관찰이 시작되지 않았습니다.')
      }
      const notifyResize = resizeCallback
      act(() => {
        notifyResize([], {} as ResizeObserver)
      })
    },
  }
}

function setupMatchMediaMock(isWideScreen: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: isWideScreen,
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

async function renderLoadedReader(resizeObserverMock: ReturnType<typeof setupResizeObserverMock>) {
  vi.stubGlobal('devicePixelRatio', 1)
  const documentLoad = createPromiseController<LoadedPdfDocument>()
  loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
  render(<Reader url="/sample.pdf" />)
  resizeObserverMock.resizeReaderAreaTo(1000, 1200)

  await act(async () => {
    documentLoad.resolve(createLoadedDocument())
    await documentLoad.promise
  })
  await screen.findByRole('img', { name: 'PDF 1페이지' })
}

describe('Reader 보조 패널 연결', () => {
  afterEach(() => {
    loadPdfDocumentMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('넓은 화면에서 패널을 열면 본문 옆 영역이 표시되고, 닫으면 열기 버튼으로 포커스가 복원된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    await renderLoadedReader(resizeObserverMock)

    const panelButton = screen.getByRole('button', { name: PANEL_OPEN_LABEL })
    await user.click(panelButton)

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PANEL_OPEN_LABEL })).toHaveFocus()
  })

  it('좁은 화면에서 패널을 열면 Sheet로 표시되고, 닫으면 열기 버튼으로 포커스가 복원된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(false)
    await renderLoadedReader(resizeObserverMock)

    const panelButton = screen.getByRole('button', { name: PANEL_OPEN_LABEL })
    await user.click(panelButton)

    expect(screen.getByRole('dialog', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PANEL_OPEN_LABEL })).toHaveFocus()
  })

  it('패널이 열린 상태에서도 읽기 영역 크기 변화가 본문 배율에 반영된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    await renderLoadedReader(resizeObserverMock)
    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    resizeObserverMock.resizeReaderAreaTo(400, 600)

    await screen.findByRole('img', { name: 'PDF 1페이지' })
    const pageFrame = screen
      .getByRole('region', { name: 'PDF 본문' })
      .querySelector('[data-slot="pdf-page-frame"]')
    expect(pageFrame).toHaveStyle({
      width: '400px',
      height: '600px',
    })
  })
})
