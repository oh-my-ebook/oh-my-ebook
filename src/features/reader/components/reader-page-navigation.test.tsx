import type { PropsWithChildren } from 'react'
import { render, screen } from '@testing-library/react'
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

const pages = Array.from({ length: 5 }, (_, index) => ({
  pageNumber: index + 1,
  width: 800,
  height: 1200,
  rotation: 0,
}))

const document = {
  numPages: pages.length,
  getPage: vi.fn(),
} satisfies PdfDocumentHandle

describe('Reader 페이지 탐색 연결', () => {
  beforeEach(() => {
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
    })
  })

  it('하단 탐색에서 페이지를 바꾸면 본문과 현재 페이지 표시를 함께 갱신한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="탐색 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    expect(screen.getByRole('navigation', { name: '페이지 탐색' })).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))

    expect(screen.getByRole('img', { name: 'PDF 2페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('2 / 5')
  })

  it('다른 문서를 열면 첫 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    const secondPages = pages.slice(0, 2)
    usePdfDocumentMock.mockImplementation((url: string) => ({
      document: {
        ...document,
        numPages: url === '/second.pdf' ? secondPages.length : pages.length,
      },
      error: null,
      pages: url === '/second.pdf' ? secondPages : pages,
      retry: vi.fn(),
      status: 'ready',
    }))
    const { rerender } = render(<Reader title="탐색 테스트" url="/first.pdf" />, {
      wrapper: MemoryRouter,
    })

    await user.click(screen.getByRole('button', { name: '마지막 페이지' }))
    expect(screen.getByRole('img', { name: 'PDF 5페이지' })).toBeInTheDocument()

    rerender(<Reader title="탐색 테스트" url="/second.pdf" />)

    expect(await screen.findByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 2')
    expect(screen.queryByText('표시할 PDF 페이지가 없습니다.')).not.toBeInTheDocument()
  })

  it('저장된 초기 페이지를 표시하고 범위를 벗어나면 첫 페이지로 보정한다', async () => {
    const { rerender } = render(<Reader initialPage={3} title="탐색 테스트" url="/sample.pdf" />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('img', { name: 'PDF 3페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('3 / 5')

    rerender(<Reader initialPage={99} title="탐색 테스트" url="/sample.pdf" />)

    expect(await screen.findByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')
  })

  it('사용자가 페이지를 이동하면 현재 페이지를 콜백으로 알린다', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Reader onPageChange={onPageChange} title="탐색 테스트" url="/sample.pdf" />, {
      wrapper: MemoryRouter,
    })

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))

    expect(onPageChange).toHaveBeenCalledOnce()
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
  it('키보드 ←·→로 이전·다음 페이지로 이동한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="탐색 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('img', { name: 'PDF 2페이지' })).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
  })

  it('화살표 키를 누르고 있으면 반복 입력마다 계속 이동하고 마지막 페이지에서 멈춘다', async () => {
    const user = userEvent.setup()
    render(<Reader title="탐색 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.keyboard('{ArrowRight>3/}')
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('4 / 5')

    await user.keyboard('{ArrowRight>5/}')
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('5 / 5')
  })

  it('글자를 입력하는 곳에 포커스가 있으면 화살표로 페이지를 넘기지 않는다', async () => {
    const user = userEvent.setup()
    render(
      <>
        <input aria-label="메모" />
        <Reader title="탐색 테스트" url="/sample.pdf" />
      </>,
      { wrapper: MemoryRouter },
    )

    await user.click(screen.getByRole('textbox', { name: '메모' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
  })
})
