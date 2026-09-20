import type { PropsWithChildren } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

const pages: readonly PdfPageInfo[] = Array.from({ length: 5 }, (_, index) => ({
  pageNumber: index + 1,
  width: 800,
  height: 1200,
  rotation: 0,
}))

const document = {
  numPages: pages.length,
  getPage: vi.fn(),
} satisfies PdfDocumentHandle

describe('Reader 두 페이지 보기 탐색', () => {
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
      availableWidth: 1600,
      containerRef: { current: null },
      isWideScreen: true,
      isSpreadAvailable: true,
    })
  })

  it('두 페이지 보기에서는 하단 탐색 버튼이 두 장씩 이동하고 홀수로 남은 마지막 페이지는 한 장만 이동한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="두 페이지 탐색 테스트" url="/sample.pdf" />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '두 페이지' }))
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getByRole('img', { name: 'PDF 3페이지' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'PDF 4페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('3 / 5')

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'PDF 5페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('5 / 5')
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '이전 페이지' }))
    expect(screen.getByRole('img', { name: 'PDF 3페이지' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'PDF 4페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('3 / 5')
  })

  it('두 페이지 보기에서 묶음의 두 번째 페이지에 있으면 첫 페이지 버튼도 비활성화한다', async () => {
    const user = userEvent.setup()
    render(<Reader initialPage={2} title="묶음 중간 페이지 테스트" url="/sample.pdf" />, {
      wrapper: MemoryRouter,
    })

    await screen.findByRole('img', { name: 'PDF 2페이지' })
    await user.click(screen.getByRole('button', { name: '두 페이지' }))
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('2 / 5')

    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '첫 페이지' })).toBeDisabled()
  })

  it('짝수 쪽수 문서에서 마지막 묶음의 첫 페이지에 있으면 마지막 페이지 버튼도 비활성화한다', async () => {
    const user = userEvent.setup()
    const evenPages: readonly PdfPageInfo[] = Array.from({ length: 6 }, (_, index) => ({
      pageNumber: index + 1,
      width: 800,
      height: 1200,
      rotation: 0,
    }))
    usePdfDocumentMock.mockReturnValue({
      document: { numPages: evenPages.length, getPage: vi.fn() } satisfies PdfDocumentHandle,
      error: null,
      pages: evenPages,
      retry: vi.fn(),
      status: 'ready',
    })

    render(<Reader title="짝수 쪽수 탐색 테스트" url="/even.pdf" />, { wrapper: MemoryRouter })

    await user.click(screen.getByRole('button', { name: '두 페이지' }))
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    await user.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('5 / 6')

    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '마지막 페이지' })).toBeDisabled()
  })
})
