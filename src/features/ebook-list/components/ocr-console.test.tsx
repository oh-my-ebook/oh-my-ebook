import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { OcrConsole } from './ocr-console'

describe('OcrConsole', () => {
  it('저장된 PDF를 페이지로 나누고 선택한 PDF의 OCR 원문을 조회한다', async () => {
    const user = userEvent.setup()
    const books = Array.from({ length: 11 }, (_, index) => ({
      id: `book-${index + 1}`,
      title: `PDF ${index + 1}`,
    }))
    const request = vi.fn(async (command: string) => {
      if (command === 'listBooks') return books
      if (command === 'listOcrLines') {
        return {
          total: 1,
          lines: [
            {
              page_number: 1,
              line_index: 0,
              raw_text: '저장된 OCR 원문',
              x0: 1,
              y0: 2,
              x1: 3,
              y1: 4,
            },
          ],
        }
      }
      return null
    })
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    render(<OcrConsole store={store} />)

    expect(await screen.findByRole('button', { name: 'PDF 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF 11' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(await screen.findByRole('button', { name: 'PDF 11' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PDF 11' }))

    expect(await screen.findByText('저장된 OCR 원문')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('listOcrLines', {
      bookId: 'book-11',
      limit: 50,
      offset: 0,
    })
  })
})
