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
      if (command === 'listOcrPages') {
        return [
          {
            page_number: 1,
            status: 'pending',
            width: null,
            height: null,
          },
        ]
      }
      if (command === 'listSearchChunks') return { total: 0, chunks: [] }
      if (command === 'listChunkSources') return { total: 0, sources: [] }
      return null
    })
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    render(<OcrConsole store={store} />)

    expect(await screen.findByRole('button', { name: 'PDF 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF 11' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(await screen.findByRole('button', { name: 'PDF 11' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PDF 11' }))
    await user.click(await screen.findByRole('tab', { name: 'ocr_lines' }))

    expect(await screen.findByText('저장된 OCR 원문')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'ocr_pages' }))
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('listOcrLines', {
      bookId: 'book-11',
      limit: 50,
      offset: 0,
    })
    expect(request).toHaveBeenCalledWith('listOcrPages', 'book-11')
  })

  it('성공한 OCR 조회 뒤에는 이전 조회 오류를 표시하지 않는다', async () => {
    const user = userEvent.setup()
    const request = vi.fn(async (command: string, payload?: unknown) => {
      if (command === 'listBooks') {
        return [
          { id: 'failed-book', title: '실패한 PDF' },
          { id: 'ready-book', title: '완료된 PDF' },
        ]
      }
      if (command === 'listOcrLines') {
        if (typeof payload === 'object' && payload !== null && 'bookId' in payload) {
          if (payload.bookId === 'failed-book') throw new Error('Request failed')
        }
        return { total: 0, lines: [] }
      }
      if (command === 'listOcrPages') return []
      if (command === 'listSearchChunks') return { total: 0, chunks: [] }
      if (command === 'listChunkSources') return { total: 0, sources: [] }
      return null
    })
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    render(<OcrConsole store={store} />)

    await user.click(await screen.findByRole('button', { name: '실패한 PDF' }))
    expect(await screen.findByText('OCR 저장 내용을 불러오지 못했습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '완료된 PDF' }))
    await user.click(await screen.findByRole('tab', { name: 'ocr_lines' }))
    expect(await screen.findByText(/저장된 OCR 원문과 좌표, 0개/)).toBeInTheDocument()
    expect(screen.queryByText('OCR 저장 내용을 불러오지 못했습니다.')).not.toBeInTheDocument()
  })
})
