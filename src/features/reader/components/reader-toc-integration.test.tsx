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
})
