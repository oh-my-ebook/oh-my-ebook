import type { PropsWithChildren } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContext } from '@assistant-ui/react'
import { createPromiseController } from '../../../test/promise-controller'
import type { BookMetadata } from '../lib/book-metadata'
import type { LoadedPdfDocument, PdfDocumentHandle, PdfDocumentLoader } from '../lib/pdf-document'
import { useWebLlmModelStore } from '../lib/web-llm/webllm-model'
import { Reader } from './reader'

const loadPdfDocumentMock = vi.hoisted(() => vi.fn<PdfDocumentLoader>())
const respondSpy = vi.hoisted(() => vi.fn<(question: string, context: ModelContext) => void>())
const recognizePdfPageMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/pdf-document', async (importOriginal) => {
  const pdfDocument = await importOriginal<typeof import('../lib/pdf-document')>()
  return { ...pdfDocument, loadPdfDocument: loadPdfDocumentMock }
})
vi.mock('../lib/ocr/page-recognition', () => ({ recognizePdfPage: recognizePdfPageMock }))

// jsdom에는 Resizable이 패널 크기를 계산할 실제 레이아웃이 없어 구분선이 입력 포커스를
// 되가져간다. 실제 primitive 동작은 ReaderPanel 테스트와 E2E에서 확인하고, 이 통합 테스트는
// Reader 상태와 채팅 연결만 검증한다.
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ResizablePanel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ResizableHandle: ({ 'aria-label': ariaLabel }: { 'aria-label': string }) => (
    <div aria-label={ariaLabel} role="separator" />
  ),
}))

// 페이지 이동이 실제로 다음 질문의 컨텍스트에 반영되는지 확인하려면 응답 생성 과정을 들여다봐야 해서,
// 실제 WebLLM 다운로드 없이 런타임 연결을 검증하도록 기본 어댑터만 제어 가능한 Mock으로 바꾼다.
vi.mock('../lib/web-llm/webllm-chat-adapter', async () => {
  const { createMockChatModelAdapter } = await import('../lib/mock-chat-adapter')
  async function* spyingRespond(question: string, context: ModelContext) {
    respondSpy(question, context)
    yield '답변'
  }
  return { webLlmChatModelAdapter: createMockChatModelAdapter(spyingRespond) }
})

// 다운로드 버튼을 누르는 시나리오가 추가돼도 jsdom에 없는 실제 WebGPU 경로를 타지 않게 한다.
vi.mock('../lib/web-llm/webllm-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/web-llm/webllm-model')>()),
  prepareWebLlmModel: vi.fn(async () => undefined),
}))

const PANEL_OPEN_LABEL = '함께 읽기 패널 열기'
const PANEL_TITLE = '함께 읽기'

// mock 상태를 모듈 전역 let 대신 각 테스트가 직접 만드는 팩토리로 캡슐화해, beforeEach 초기화
// 누락으로 테스트 간 상태가 새는 걸 원천적으로 막는다.
// 보조 패널이 열리면 ReaderChat의 Thread도 별도 ResizeObserver를 만들므로, 마지막으로 생성된
// 인스턴스가 아니라 실제로 읽기 영역을 observe()한 콜백을 대상 요소 기준으로 찾는다.
function setupResizeObserverMock() {
  const resizeCallbacksByTarget = new Map<Element, ResizeObserverCallback>()

  class ResizeObserverMock {
    #callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback
    }

    observe = (target: Element) => {
      resizeCallbacksByTarget.set(target, this.#callback)
    }
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

      const notifyResize = resizeCallbacksByTarget.get(readerArea)
      if (!notifyResize) {
        throw new Error('읽기 영역 관찰이 시작되지 않았습니다.')
      }
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

function createLoadedDocument(pageCount = 1): LoadedPdfDocument {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  const getPage = vi.fn(async (pageNumber: number) => ({
    pageNumber,
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 900 * scale,
      rotation: 0,
    }),
    render: renderPage,
  }))
  const document = { numPages: pageCount, getPage } satisfies PdfDocumentHandle

  return {
    document,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      width: 800,
      height: 1200,
      rotation: 0,
    })),
  }
}

async function renderLoadedReader(
  resizeObserverMock: ReturnType<typeof setupResizeObserverMock>,
  pageCount = 1,
  bookMetadata?: BookMetadata,
) {
  vi.stubGlobal('devicePixelRatio', 1)
  recognizePdfPageMock.mockImplementation(async (page: { pageNumber: number }) => ({
    width: 1,
    height: 1,
    lines: [
      {
        text: `${page.pageNumber}페이지 OCR 본문`,
        x0: 0,
        y0: 0,
        x1: 1,
        y1: 1,
        fontSize: 1,
        scaleX: 1,
      },
    ],
  }))
  const documentLoad = createPromiseController<LoadedPdfDocument>()
  loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
  const view = render(<Reader bookMetadata={bookMetadata} url="/sample.pdf" />, {
    wrapper: MemoryRouter,
  })
  resizeObserverMock.resizeReaderAreaTo(1000, 1200)

  await act(async () => {
    documentLoad.resolve(createLoadedDocument(pageCount))
    await documentLoad.promise
  })
  await screen.findByRole('img', { name: 'PDF 1페이지' })
  return view
}

describe('Reader 보조 패널 연결', () => {
  afterEach(() => {
    loadPdfDocumentMock.mockReset()
    respondSpy.mockReset()
    act(() => useWebLlmModelStore.setState(useWebLlmModelStore.getInitialState(), true))
    vi.unstubAllGlobals()
  })

  it('넓은 화면에서 패널을 열면 본문 옆 영역이 표시되고, 같은 버튼으로 닫는다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    await renderLoadedReader(resizeObserverMock)

    const panelButton = screen.getByRole('button', { name: PANEL_OPEN_LABEL })
    await user.click(panelButton)

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: '함께 읽기 패널 너비 조절' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '함께 읽기 패널 닫기', pressed: true }))

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: PANEL_OPEN_LABEL, pressed: false })).toHaveFocus()
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

  it('패널을 닫았다가 다시 열면 대화 내역이 초기화된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    useWebLlmModelStore.setState({ status: 'ready' })
    await renderLoadedReader(resizeObserverMock)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: '질문 입력' })
    await user.type(input, '질문')
    await user.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(await screen.findByText('질문')).toBeInTheDocument()
    // 다음 상호작용 전에 응답을 끝까지 받아, 패널을 닫아도 실행 중인 타이머가 남지 않게 한다.
    await screen.findByRole('button', { name: '질문 보내기' }, { timeout: 3000 })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.queryByText('질문')).not.toBeInTheDocument()
  })

  it('문서 주소가 바뀌면 패널을 닫지 않아도 대화가 초기화된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    useWebLlmModelStore.setState({ status: 'ready' })
    const { rerender } = await renderLoadedReader(resizeObserverMock)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    await user.type(screen.getByRole('textbox', { name: '질문 입력' }), '질문')
    await user.click(screen.getByRole('button', { name: '질문 보내기' }))
    expect(await screen.findByText('질문')).toBeInTheDocument()
    await screen.findByRole('button', { name: '질문 보내기' }, { timeout: 3000 })

    rerender(<Reader url="/other.pdf" />)
    await screen.findByRole('img', { name: 'PDF 1페이지' })

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.queryByText('질문')).not.toBeInTheDocument()
  })

  it('좁은 화면에서 대화가 길어져도 채팅 조작부가 계속 표시된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(false)
    useWebLlmModelStore.setState({ status: 'ready' })
    await renderLoadedReader(resizeObserverMock)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: '질문 입력' })

    for (const question of ['첫번째 질문', '두번째 질문', '세번째 질문']) {
      await user.type(input, question)
      await user.keyboard('{Enter}')
      await screen.findByText(question)
      // 다음 질문을 보내기 전에 응답을 끝까지 받아, 실행 중인 Mock 타이머가 남지 않게 한다.
      await screen.findByRole('button', { name: '질문 보내기' }, { timeout: 3000 })
    }

    expect(screen.getByRole('textbox', { name: '질문 입력' })).toBeVisible()
    expect(screen.getByText('세번째 질문')).toBeVisible()
  })

  it('답변을 받은 뒤 다음 페이지로 이동해 새 질문을 보내면 이전 대화는 유지되고 이동한 페이지 기준으로 처리된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    useWebLlmModelStore.setState({ status: 'ready' })
    await renderLoadedReader(resizeObserverMock, 2)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: '질문 입력' })

    await user.type(input, '첫 질문')
    await user.click(screen.getByRole('button', { name: '질문 보내기' }))
    await screen.findByText('첫 질문')
    await screen.findByRole('button', { name: '질문 보내기' }, { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByRole('img', { name: 'PDF 2페이지' })

    await user.type(input, '둘째 질문')
    await user.click(screen.getByRole('button', { name: '질문 보내기' }))
    await screen.findByText('둘째 질문')
    await screen.findByRole('button', { name: '질문 보내기' }, { timeout: 3000 })

    expect(screen.getByText('첫 질문')).toBeInTheDocument()
    expect(respondSpy).toHaveBeenCalledTimes(2)
    expect(respondSpy.mock.calls[0]?.[0]).toBe('첫 질문')
    expect(respondSpy.mock.calls[0]?.[1]?.system).toContain('1')
    expect(respondSpy.mock.calls[0]?.[1]?.system).toContain('1페이지 OCR 본문')
    expect(respondSpy.mock.calls[1]?.[0]).toBe('둘째 질문')
    expect(respondSpy.mock.calls[1]?.[1]?.system).toContain('2')
    expect(respondSpy.mock.calls[1]?.[1]?.system).toContain('2페이지 OCR 본문')
    expect(respondSpy.mock.calls[1]?.[1]?.system).not.toContain('1페이지 OCR 본문')
  })

  it('리더가 받은 도서 메타데이터를 질문 컨텍스트에 전달한다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    useWebLlmModelStore.setState({ status: 'ready' })
    await renderLoadedReader(resizeObserverMock, 1, {
      author: '저자',
      publisher: '출판사',
      title: '도서 제목',
    })

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    await user.type(screen.getByRole('textbox', { name: '질문 입력' }), '질문')
    await user.click(screen.getByRole('button', { name: '질문 보내기' }))

    expect(respondSpy).toHaveBeenCalledOnce()
    expect(respondSpy.mock.calls[0]?.[1]?.system).toContain('제목: 도서 제목')
  })
})
