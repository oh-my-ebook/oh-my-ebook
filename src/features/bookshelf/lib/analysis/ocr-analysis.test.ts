import { createStoreMock, createStoredBookDetail } from '@/test/ebook-store'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createSearchChunks, extractSearchTermsWithKiwi, loadPdfDocument, recognizePdfPageRaw } =
  vi.hoisted(() => ({
    createSearchChunks: vi.fn(),
    extractSearchTermsWithKiwi: vi.fn(),
    loadPdfDocument: vi.fn(),
    recognizePdfPageRaw: vi.fn(),
  }))

vi.mock('@/lib/pdf/load-document', () => ({ loadPdfDocument }))
vi.mock('@/lib/pdf/ocr/recognize-page', () => ({ recognizePdfPageRaw }))
vi.mock('./search-chunking', () => ({ createSearchChunks }))
vi.mock('@/lib/kiwi/client', () => ({ extractSearchTermsWithKiwi }))

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
    extractSearchTermsWithKiwi.mockResolvedValue([{ term: '검색', termFrequency: 1 }])
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdf_data: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.storeOcrPage.mockResolvedValueOnce(false)
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
    store.storeOcrPage.mockResolvedValueOnce(true)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { page_number: 1, width: null, height: null, status: 'ready' },
      { page_number: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '원문' },
    ])

    await runOcrAnalysis('book-id', store)

    expect(store.initializeOcrPages).toHaveBeenCalledWith({
      bookId: 'book-id',
      pageCount: 2,
    })
    expect(store.prepareOcrPagesForRun).toHaveBeenCalledWith('book-id')
    expect(store.storeOcrPage).toHaveBeenNthCalledWith(1, {
      pageId: 'page-1',
      width: 100,
      height: 200,
      lines: [{ rawText: '원문', x0: 1, y0: 2, x1: 3, y1: 4 }],
    })
    expect(store.storeOcrPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageId: 'page-2' }),
    )
    expect(store.acquireNextOcrPage).toHaveBeenCalledWith('book-id')
    expect(store.listOcrPages).toHaveBeenCalledWith('book-id')
    expect(store.getOcrLinesForChunking).toHaveBeenCalledWith('book-id')
    expect(createSearchChunks).toHaveBeenCalledWith(
      [{ ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '원문' }],
      expect.any(AbortSignal),
    )
    expect(extractSearchTermsWithKiwi).toHaveBeenCalledWith('검색 청크', expect.any(AbortSignal))
    expect(store.storeSearchIndex).toHaveBeenCalledWith({
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-1',
          ordinal: 0,
          text: '검색 청크',
          tokenCount: 2,
          sources: [],
          terms: [{ term: '검색', termFrequency: 1 }],
        },
      ],
    })
    expect(recognizePdfPageRaw).toHaveBeenCalledTimes(2)
    expect(abort).toHaveBeenCalledOnce()
  })

  it('페이지 OCR 실패 후에도 남은 pending 페이지를 처리하고 분석을 실패 상태로 남긴다', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValueOnce(new Error('OCR failed')).mockResolvedValueOnce({
      width: 100,
      height: 200,
      lines: [],
    })
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdf_data: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
    store.storeOcrPage.mockResolvedValueOnce(false)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { page_number: 1, width: null, height: null, status: 'failed' },
      { page_number: 1, width: null, height: null, status: 'ready' },
    ])

    await runOcrAnalysis('book-id', store)

    expect(store.failOcrPage).toHaveBeenCalledWith('page-1')
    expect(store.prepareOcrPagesForRun).toHaveBeenCalledWith('book-id')
    expect(store.storeOcrPage).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-2' }))
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
    expect(store.getOcrLinesForChunking).not.toHaveBeenCalledWith('book-id')
    expect(abort).toHaveBeenCalledOnce()
  })

  it('페이지 OCR 오류를 호출자에게 전달하면서 다음 페이지를 계속 처리한다', async () => {
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValueOnce(new Error('PaddleOCR model unavailable'))
    const onFailure = vi.fn()
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdf_data: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-3', pageNumber: 3 })
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { page_number: 1, width: null, height: null, status: 'failed' },
    ])

    await runOcrAnalysis('book-id', store, { onFailure })

    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: 'book-id',
        error: expect.any(Error),
        pageNumber: 3,
        stage: 'page-ocr',
      }),
    )
  })

  it('청킹에 실패하면 색인 완료를 기록하지 않고 책 분석을 실패 처리한다', async () => {
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockResolvedValue({ width: 100, height: 200, lines: [] })
    createSearchChunks.mockRejectedValueOnce(new Error('Kiwi failed'))
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdf_data: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.storeOcrPage.mockResolvedValueOnce(true)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { page_number: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([])

    await runOcrAnalysis('book-id', store)

    expect(createSearchChunks).toHaveBeenCalledOnce()
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
    expect(store.storeSearchIndex).not.toHaveBeenCalled()
  })

  it('역색인 저장에 실패하면 분석을 실패 처리한다', async () => {
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    createSearchChunks.mockResolvedValueOnce([
      { id: 'chunk-1', ordinal: 0, text: '검색 청크', tokenCount: 2, sources: [] },
    ])
    extractSearchTermsWithKiwi.mockResolvedValueOnce([{ term: '검색', termFrequency: 1 }])
    const store = createStoreMock()
    store.getBook.mockImplementation(async () => {
      return createStoredBookDetail({ pdf_data: new Uint8Array([1]) })
    })
    store.acquireNextOcrPage.mockImplementation(async () => {
      return null
    })
    store.listOcrPages.mockImplementation(async () => {
      return [{ page_number: 1, width: null, height: null, status: 'ready' }]
    })
    store.getOcrLinesForChunking.mockImplementation(async () => {
      return []
    })
    store.storeSearchIndex.mockImplementation(async () => {
      throw new Error('index write failed')
    })

    await expect(runOcrAnalysis('book-id', store)).resolves.toBe('failed')

    expect(store.storeSearchIndex).toHaveBeenCalledWith({
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-1',
          ordinal: 0,
          text: '검색 청크',
          tokenCount: 2,
          sources: [],
          terms: [{ term: '검색', termFrequency: 1 }],
        },
      ],
    })
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
  })

  it('모든 OCR 페이지가 저장된 뒤 청킹이 실패했으면 OCR을 다시 하지 않고 청킹부터 재시도한다', async () => {
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    createSearchChunks.mockResolvedValueOnce([])
    extractSearchTermsWithKiwi.mockResolvedValueOnce([])
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdf_data: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { page_number: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([])

    await runOcrAnalysis('book-id', store)

    expect(recognizePdfPageRaw).not.toHaveBeenCalled()
    expect(createSearchChunks).toHaveBeenCalledOnce()
    expect(store.storeSearchIndex).toHaveBeenCalledWith({ bookId: 'book-id', chunks: [] })
  })
})
