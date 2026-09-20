import type { PropsWithChildren } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { Reader } from './reader'

const usePdfDocumentMock = vi.hoisted(() => vi.fn())
const useReaderLayoutMock = vi.hoisted(() => vi.fn())

vi.mock('../hooks/use-pdf-document', () => ({ usePdfDocument: usePdfDocumentMock }))
vi.mock('../hooks/use-reader-layout', () => ({ useReaderLayout: useReaderLayoutMock }))
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ResizablePanel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  ResizableHandle: () => <div role="separator" />,
}))
vi.mock('./pdf-viewport', () => ({
  PdfViewport: ({ pages }: { pages: readonly PdfPageInfo[] }) =>
    pages.map((page) => (
      <div aria-label={`PDF ${page.pageNumber}페이지`} key={page.pageNumber} role="img" />
    )),
}))

// jsdom에는 IntersectionObserver가 없다. 이 테스트는 목차 클릭이 실제로 본문 페이지를 바꾸는지만
// 확인하므로, 썸네일 지연 렌더링 자체(toc-page-thumbnail.test.tsx에서 검증)는 무해한 stub로 대체한다.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const pages = Array.from({ length: 3 }, (_, index) => ({
  pageNumber: index + 1,
  width: 800,
  height: 1200,
  rotation: 0,
}))

const document = {
  numPages: pages.length,
  getPage: vi.fn(async () => ({ getViewport: vi.fn() })),
} satisfies PdfDocumentHandle

describe('Reader 목차 연결', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    usePdfDocumentMock.mockReturnValue({
      document,
      error: null,
      pages,
      retry: vi.fn(),
      status: 'ready',
    })
    useReaderLayoutMock.mockReturnValue({
      availableHeight: 900,
      availableWidth: 800,
      containerRef: { current: null },
      isSpreadAvailable: false,
      isWideScreen: true,
    })
  })

  it('목차에서 썸네일을 클릭하면 해당 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="목차 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '목차 열기' }))
    const toc = screen.getByRole('region', { name: '목차' })
    await user.click(within(toc).getByRole('button', { name: '3페이지' }))

    expect(screen.getByRole('img', { name: 'PDF 3페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('3 / 3')
  })

  // 넓은 화면에서 목차를 열어도 포커스는 여는 버튼에 그대로 남으므로(reader-toc.tsx 참고),
  // 목차 밖에 포커스가 있는 상태다.
  it('목차가 열려 있어도 포커스가 목차 밖에 있으면 좌우 화살표로 페이지를 넘긴다', async () => {
    const user = userEvent.setup()
    render(<Reader title="목차 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '목차 열기' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('img', { name: 'PDF 2페이지' })).toBeInTheDocument()
  })

  it('포커스가 목차 안에 있으면 좌우 화살표는 막히고 위아래 화살표로 이전·다음 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="목차 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '목차 열기' }))
    const toc = screen.getByRole('region', { name: '목차' })
    within(toc).getByRole('button', { name: '1페이지' }).focus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('img', { name: 'PDF 2페이지' })).toBeInTheDocument()

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
  })
})
