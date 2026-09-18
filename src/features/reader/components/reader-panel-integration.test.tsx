import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelContext } from '@assistant-ui/react'
import { createPromiseController } from '../../../test/promise-controller'
import type { LoadedPdfDocument, PdfDocumentHandle, PdfDocumentLoader } from '../lib/pdf-document'
import { Reader } from './reader'

const loadPdfDocumentMock = vi.hoisted(() => vi.fn<PdfDocumentLoader>())
const respondSpy = vi.hoisted(() => vi.fn<(question: string, context: ModelContext) => void>())

vi.mock('../lib/pdf-document', async (importOriginal) => {
  const pdfDocument = await importOriginal<typeof import('../lib/pdf-document')>()
  return { ...pdfDocument, loadPdfDocument: loadPdfDocumentMock }
})

// 페이지 이동이 실제로 다음 질문의 컨텍스트에 반영되는지 확인하려면 응답 생성 과정을 들여다봐야 해서,
// 실제 WebLLM 다운로드 없이 런타임 연결을 검증하도록 기본 어댑터만 제어 가능한 Mock으로 바꾼다.
vi.mock('../lib/web-llm/webllm-chat-adapter', async (importOriginal) => {
  const webLlmChatAdapter =
    await importOriginal<typeof import('../lib/web-llm/webllm-chat-adapter')>()
  const mockChatAdapter = await import('../lib/mock-chat-adapter')
  async function* spyingRespond(question: string, context: ModelContext) {
    respondSpy(question, context)
    yield '답변'
  }
  return {
    ...webLlmChatAdapter,
    webLlmChatModelAdapter: mockChatAdapter.createMockChatModelAdapter(spyingRespond),
  }
})

const PANEL_OPEN_LABEL = '보조 패널 열기'
const PANEL_TITLE = '보조 패널'

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
) {
  vi.stubGlobal('devicePixelRatio', 1)
  const documentLoad = createPromiseController<LoadedPdfDocument>()
  loadPdfDocumentMock.mockReturnValue(documentLoad.promise)
  render(<Reader url="/sample.pdf" />)
  resizeObserverMock.resizeReaderAreaTo(1000, 1200)

  await act(async () => {
    documentLoad.resolve(createLoadedDocument(pageCount))
    await documentLoad.promise
  })
  await screen.findByRole('img', { name: 'PDF 1페이지' })
}

describe('Reader 보조 패널 연결', () => {
  afterEach(() => {
    loadPdfDocumentMock.mockReset()
    respondSpy.mockReset()
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

  it('패널을 닫았다가 다시 열면 대화 내역이 초기화된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    await renderLoadedReader(resizeObserverMock)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: 'Message input' })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('질문')).toBeInTheDocument()
    // 다음 상호작용 전에 응답을 끝까지 받아, 패널을 닫아도 실행 중인 타이머가 남지 않게 한다.
    await screen.findByRole('button', { name: 'Send message' }, { timeout: 3000 })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.queryByText('질문')).not.toBeInTheDocument()
  })

  it('좁은 화면에서 대화가 길어져도 채팅 조작부가 계속 표시된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(false)
    await renderLoadedReader(resizeObserverMock)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: 'Message input' })

    for (const question of ['첫번째 질문', '두번째 질문', '세번째 질문']) {
      await user.type(input, question)
      await user.keyboard('{Enter}')
      await screen.findByText(question)
      // 다음 질문을 보내기 전에 응답을 끝까지 받아, 실행 중인 Mock 타이머가 남지 않게 한다.
      await screen.findByRole('button', { name: 'Send message' }, { timeout: 3000 })
    }

    expect(screen.getByRole('textbox', { name: 'Message input' })).toBeVisible()
    expect(screen.getByText('세번째 질문')).toBeVisible()
  })

  it('답변을 받은 뒤 다음 페이지로 이동해 새 질문을 보내면 이전 대화는 유지되고 이동한 페이지 기준으로 처리된다', async () => {
    const user = userEvent.setup()
    const resizeObserverMock = setupResizeObserverMock()
    setupMatchMediaMock(true)
    await renderLoadedReader(resizeObserverMock, 2)

    await user.click(screen.getByRole('button', { name: PANEL_OPEN_LABEL }))
    const input = screen.getByRole('textbox', { name: 'Message input' })

    await user.type(input, '첫 질문')
    await user.keyboard('{Enter}')
    await screen.findByText('첫 질문')
    await screen.findByRole('button', { name: 'Send message' }, { timeout: 3000 })

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    await screen.findByRole('img', { name: 'PDF 2페이지' })

    await user.type(input, '둘째 질문')
    await user.keyboard('{Enter}')
    await screen.findByText('둘째 질문')
    await screen.findByRole('button', { name: 'Send message' }, { timeout: 3000 })

    expect(screen.getByText('첫 질문')).toBeInTheDocument()
    expect(respondSpy).toHaveBeenCalledTimes(2)
    expect(respondSpy.mock.calls[0]?.[0]).toBe('첫 질문')
    expect(respondSpy.mock.calls[0]?.[1]?.system).toContain('1')
    expect(respondSpy.mock.calls[1]?.[0]).toBe('둘째 질문')
    expect(respondSpy.mock.calls[1]?.[1]?.system).toContain('2')
  })
})
