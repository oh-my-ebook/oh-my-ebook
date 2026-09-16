import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { Reader } from './reader'

const usePdfDocumentMock = vi.hoisted(() => vi.fn())
const useReaderLayoutMock = vi.hoisted(() => vi.fn())

vi.mock('../hooks/use-pdf-document', () => ({ usePdfDocument: usePdfDocumentMock }))
vi.mock('../hooks/use-reader-layout', () => ({ useReaderLayout: useReaderLayoutMock }))

function createReadyDocument() {
  const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 900 * scale,
      rotation: 0,
    }),
    render: renderPage,
  }
  const document = {
    numPages: 2,
    getPage: vi.fn(async () => page),
  } satisfies PdfDocumentHandle
  const pages: readonly PdfPageInfo[] = [
    { pageNumber: 1, width: 800, height: 1200, rotation: 0 },
    { pageNumber: 2, width: 800, height: 1200, rotation: 0 },
  ]

  return { document, pages }
}

describe('Reader 보기 전환', () => {
  beforeEach(() => {
    const { document, pages } = createReadyDocument()
    usePdfDocumentMock.mockReturnValue({
      status: 'ready',
      document,
      pages,
      error: null,
      retry: vi.fn(),
    })
    useReaderLayoutMock.mockReturnValue({
      availableHeight: 1200,
      availableWidth: 1000,
      containerRef: { current: null },
      isWideScreen: true,
      isSpreadAvailable: true,
    })
    vi.stubGlobal('devicePixelRatio', 1)
    // Reader가 전역 너비를 다시 읽으면 훅의 판단과 어긋나는 상황을 재현한다.
    vi.stubGlobal('innerWidth', 500)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('한 페이지 보기에서 두 페이지 보기로 전환하고 표시 범위를 갱신한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="보기 전환 샘플" url="/sample.pdf" />)

    expect(screen.getByRole('group', { name: '보기 방식' })).toBeInTheDocument()
    expect(await screen.findAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 2')

    await user.click(screen.getByRole('button', { name: '두 페이지' }))

    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 2')
    const frames = screen
      .getByRole('region', { name: 'PDF 본문' })
      .querySelectorAll('[data-slot="pdf-page-frame"]')
    expect(frames).toHaveLength(2)
    expect(frames[0]).toHaveStyle({ width: '492px', height: '738px' })
    expect(frames[1]).toHaveStyle({ width: '492px', height: '738px' })
  })
})
