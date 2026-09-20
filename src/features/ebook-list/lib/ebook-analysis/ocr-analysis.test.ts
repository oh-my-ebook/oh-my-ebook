import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EbookLibraryStore } from '../ebook-library-store'

const { createSearchChunks, loadPdfDocument, recognizePdfPageRaw } = vi.hoisted(() => ({
  createSearchChunks: vi.fn(),
  loadPdfDocument: vi.fn(),
  recognizePdfPageRaw: vi.fn(),
}))

vi.mock('@/features/reader/lib/pdf-document', () => ({ loadPdfDocument }))
vi.mock('@/features/reader/lib/ocr/page-recognition', () => ({ recognizePdfPageRaw }))
vi.mock('./search-chunking', () => ({ createSearchChunks }))

import { runOcrAnalysis } from './ocr-analysis'

describe('runOcrAnalysis', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('페이지를 번호 순서로 하나씩 OCR하고 저장한다', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    const page = {}
    loadPdfDocument.mockResolvedValue({
      document: { numPages: 2, getPage: vi.fn(async () => page) },
    })
    recognizePdfPageRaw.mockResolvedValue({
      width: 100,
      height: 200,
      lines: [{ text: '원문', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }],
    })
    createSearchChunks.mockResolvedValue([
      { id: 'chunk-1', ordinal: 0, text: '검색 청크', tokenCount: 2, sources: [] },
    ])
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pdf_data: new Uint8Array([1]) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([
        { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '원문' },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(null)
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    await runOcrAnalysis('book-id', store)

    expect(request).toHaveBeenNthCalledWith(2, 'initializeOcrPages', {
      bookId: 'book-id',
      pageCount: 2,
    })
    expect(request).toHaveBeenNthCalledWith(3, 'prepareOcrPagesForRun', 'book-id')
    expect(request).toHaveBeenNthCalledWith(5, 'storeOcrPage', {
      pageId: 'page-1',
      width: 100,
      height: 200,
      lines: [{ rawText: '원문', x0: 1, y0: 2, x1: 3, y1: 4 }],
    })
    expect(request).toHaveBeenNthCalledWith(
      7,
      'storeOcrPage',
      expect.objectContaining({ pageId: 'page-2' }),
    )
    expect(request).toHaveBeenNthCalledWith(8, 'getOcrLinesForChunking', 'book-id')
    expect(createSearchChunks).toHaveBeenCalledWith(
      [{ ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '원문' }],
      expect.any(AbortSignal),
    )
    expect(request).toHaveBeenNthCalledWith(9, 'storeSearchChunks', {
      bookId: 'book-id',
      chunks: [{ id: 'chunk-1', ordinal: 0, text: '검색 청크', tokenCount: 2, sources: [] }],
    })
    expect(recognizePdfPageRaw).toHaveBeenCalledTimes(2)
    expect(abort).toHaveBeenCalledOnce()
  })

  it('페이지 OCR 실패 후에도 남은 pending 페이지를 계속 처리한다', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValueOnce(new Error('OCR failed')).mockResolvedValueOnce({
      width: 100,
      height: 200,
      lines: [],
    })
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pdf_data: new Uint8Array([1]) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(null)
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    await runOcrAnalysis('book-id', store)

    expect(request).toHaveBeenCalledWith('failOcrPage', 'page-1')
    expect(request).toHaveBeenCalledWith('prepareOcrPagesForRun', 'book-id')
    expect(request).toHaveBeenCalledWith(
      'storeOcrPage',
      expect.objectContaining({ pageId: 'page-2' }),
    )
    expect(request).not.toHaveBeenCalledWith('failBookAnalysis', 'book-id')
    expect(request).not.toHaveBeenCalledWith('getOcrLinesForChunking', 'book-id')
    expect(abort).toHaveBeenCalledOnce()
  })

  it('청킹에 실패하면 색인 완료를 기록하지 않고 책 분석을 실패 처리한다', async () => {
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockResolvedValue({ width: 100, height: 200, lines: [] })
    createSearchChunks.mockRejectedValueOnce(new Error('Kiwi failed'))
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pdf_data: new Uint8Array([1]) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    await runOcrAnalysis('book-id', store)

    expect(createSearchChunks).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('failBookAnalysis', 'book-id')
    expect(request).not.toHaveBeenCalledWith('storeSearchChunks', expect.anything())
    expect(request.mock.calls.some(([command]) => String(command).includes('indexed'))).toBe(false)
  })
})
