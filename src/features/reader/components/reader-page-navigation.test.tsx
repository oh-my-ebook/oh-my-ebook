import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { Reader } from './reader'

const usePdfDocumentMock = vi.hoisted(() => vi.fn())
const useReaderLayoutMock = vi.hoisted(() => vi.fn())

vi.mock('../hooks/use-pdf-document', () => ({ usePdfDocument: usePdfDocumentMock }))
vi.mock('../hooks/use-reader-layout', () => ({ useReaderLayout: useReaderLayoutMock }))
vi.mock('./pdf-viewport', () => ({
  PdfViewport: ({ page }: { page: PdfPageInfo }) => (
    <div aria-label={`PDF ${page.pageNumber}페이지`} role="img" />
  ),
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
    render(<Reader title="탐색 테스트" url="/sample.pdf" />)
    const readerArea = screen.getByRole('main', { name: 'PDF 읽기 영역' })
    const scrollTo = vi.fn()
    readerArea.scrollTo = scrollTo

    expect(screen.getByRole('navigation', { name: '페이지 탐색' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'PDF 1페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 5')

    await user.click(screen.getByRole('button', { name: '다음 페이지' }))

    expect(screen.getByRole('img', { name: 'PDF 2페이지' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('2 / 5')
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })
})
