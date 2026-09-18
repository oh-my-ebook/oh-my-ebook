import { createRef, type PropsWithChildren } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentHandle } from '../lib/pdf-document'
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

describe('Reader 크기 조절 연결', () => {
  beforeEach(() => {
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 900 * scale,
        rotation: 0,
      }),
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    }
    const document = {
      numPages: 1,
      getPage: vi.fn(async () => page),
    } satisfies PdfDocumentHandle

    usePdfDocumentMock.mockReturnValue({
      status: 'ready',
      document,
      pages: [{ pageNumber: 1, width: 800, height: 1200, rotation: 0 }],
      error: null,
      retry: vi.fn(),
    })
    useReaderLayoutMock.mockReturnValue({
      availableWidth: 800,
      availableHeight: 900,
      containerRef: createRef<HTMLDivElement>(),
      isWideScreen: false,
      isSpreadAvailable: false,
    })
  })

  it('확대·축소·높이 맞춤 결과를 한 페이지 본문 배율에 반영한다', async () => {
    const user = userEvent.setup()
    render(<Reader title="테스트 PDF" url="/test.pdf" />)

    expect(screen.getByRole('status', { name: '현재 확대율' })).toHaveTextContent('75%')
    const firstPage = await screen.findByRole('img', { name: 'PDF 1페이지' })
    expect(firstPage.parentElement?.parentElement).toHaveStyle({
      width: '600px',
      height: '900px',
    })

    await user.click(screen.getByRole('button', { name: '확대' }))

    expect(screen.getByRole('status', { name: '현재 확대율' })).toHaveTextContent('100%')
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'PDF 1페이지' }).parentElement?.parentElement,
      ).toHaveStyle({
        width: '800px',
        height: '1200px',
      }),
    )

    await user.click(screen.getByRole('button', { name: '확대' }))
    await user.click(screen.getByRole('button', { name: '축소' }))

    expect(screen.getByRole('status', { name: '현재 확대율' })).toHaveTextContent('100%')
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: '높이 맞춤' }))

    expect(screen.getByRole('status', { name: '현재 확대율' })).toHaveTextContent('75%')
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'PDF 1페이지' }).parentElement?.parentElement,
      ).toHaveStyle({
        width: '600px',
        height: '900px',
      }),
    )
  })
})
