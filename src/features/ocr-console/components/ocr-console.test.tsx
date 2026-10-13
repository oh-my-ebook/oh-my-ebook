import { createStoreMock, createStoredBook } from '@/test/ebook-store'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { OcrConsole } from './ocr-console'

describe('OcrConsole', () => {
  it('저장된 PDF를 페이지로 나누고 선택한 PDF의 OCR 원문을 조회한다', async () => {
    const user = userEvent.setup()
    const books = Array.from({ length: 11 }, (_, index) =>
      createStoredBook({
        id: `book-${index + 1}`,
        title: `PDF ${index + 1}`,
        analysis_status: 'analyzing',
      }),
    )
    const store = createStoreMock()
    store.listBooks.mockImplementation(async () => {
      return books
    })
    store.listOcrLines.mockImplementation(async () => {
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
    })
    store.listOcrPages.mockImplementation(async () => {
      return [
        {
          page_number: 1,
          status: 'pending',
          width: null,
          height: null,
        },
      ]
    })
    store.getBookAnalysisStatus.mockImplementation(async () => {
      return 'analyzing'
    })
    store.listSearchChunks.mockImplementation(async () => {
      return { total: 0, chunks: [] }
    })
    store.listChunkSources.mockImplementation(async () => {
      return { total: 0, sources: [] }
    })
    store.listSearchTerms.mockImplementation(async () => {
      return { total: 1, terms: [{ id: 1, term: '검색', document_frequency: 2 }] }
    })
    store.listSearchPostings.mockImplementation(async () => {
      return {
        total: 1,
        postings: [
          {
            term_id: 1,
            chunk_id: 'chunk-1',
            term_frequency: 2,
            term: '검색',
            chunk_ordinal: 0,
          },
        ],
      }
    })

    render(<OcrConsole store={store} />)

    expect(await screen.findByRole('button', { name: 'PDF 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF 11' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(await screen.findByRole('button', { name: 'PDF 11' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'PDF 11' }))
    await user.click(await screen.findByRole('tab', { name: 'ocr_lines' }))

    expect(await screen.findByText('저장된 OCR 원문')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'search_terms' }))
    expect(await screen.findByText('검색')).toBeInTheDocument()
    expect(screen.queryByText('chunk-1')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'search_postings' }))
    expect(await screen.findByText('검색')).toBeInTheDocument()
    expect(screen.getByText('chunk-1')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'ocr_pages' }))
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(store.listOcrLines).toHaveBeenCalledWith({
      bookId: 'book-11',
      limit: 50,
      offset: 0,
    })
    expect(store.listOcrPages).toHaveBeenCalledWith('book-11')
    expect(store.getBookAnalysisStatus).toHaveBeenCalledWith('book-11')
    expect(store.listSearchTerms).toHaveBeenCalledWith({
      bookId: 'book-11',
      limit: 50,
      offset: 0,
    })
    expect(store.listSearchPostings).toHaveBeenCalledWith({
      bookId: 'book-11',
      limit: 50,
      offset: 0,
    })
  })

  it('성공한 OCR 조회 뒤에는 이전 조회 오류를 표시하지 않는다', async () => {
    const user = userEvent.setup()
    const store = createStoreMock()
    store.listBooks.mockImplementation(async () => {
      return [
        createStoredBook({ id: 'failed-book', title: '실패한 PDF', analysis_status: 'analyzing' }),
        createStoredBook({ id: 'ready-book', title: '완료된 PDF', analysis_status: 'ready' }),
      ]
    })
    store.listOcrLines.mockImplementation(async (payload) => {
      if (typeof payload === 'object' && payload !== null && 'bookId' in payload) {
        if (payload.bookId === 'failed-book') throw new Error('Request failed')
      }
      return { total: 0, lines: [] }
    })
    store.listOcrPages.mockImplementation(async () => {
      return []
    })
    store.getBookAnalysisStatus.mockImplementation(async () => {
      return 'analyzing'
    })
    store.listSearchChunks.mockImplementation(async () => {
      return { total: 0, chunks: [] }
    })
    store.listChunkSources.mockImplementation(async () => {
      return { total: 0, sources: [] }
    })
    store.listSearchTerms.mockImplementation(async () => {
      return { total: 0, terms: [] }
    })
    store.listSearchPostings.mockImplementation(async () => {
      return { total: 0, postings: [] }
    })

    render(<OcrConsole store={store} />)

    await user.click(await screen.findByRole('button', { name: '실패한 PDF' }))
    expect(await screen.findByText('OCR 저장 내용을 불러오지 못했습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '완료된 PDF' }))
    await user.click(await screen.findByRole('tab', { name: 'ocr_lines' }))
    expect(await screen.findByText(/저장된 OCR 원문과 좌표, 0개/)).toBeInTheDocument()
    expect(screen.queryByText('OCR 저장 내용을 불러오지 못했습니다.')).not.toBeInTheDocument()
  })
})
