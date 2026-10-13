import { createStoreMock, createStoredBookDetail } from '@/test/ebook-store'
import type { KiwiClient } from '@/lib/kiwi/kiwi.client'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function createAnalysisStub() {
  const createSearchChunks = vi.fn()
  const extractSearchTerms = vi.fn<KiwiClient['extractSearchTerms']>()
  const loadPdfDocument = vi.fn()
  const recognizePdfPageRaw = vi.fn()

  vi.doMock('@/lib/pdf/load-document', () => ({ loadPdfDocument }))
  vi.doMock('@/lib/pdf/ocr/recognize-page', () => ({ recognizePdfPageRaw }))
  vi.doMock('./search-chunking', () => ({ createSearchChunks }))
  vi.doMock('@/lib/kiwi/kiwi.client', () => ({ kiwiClient: { extractSearchTerms } }))
  const { runOcrAnalysis } = await import('./ocr-analysis')

  return {
    createSearchChunks,
    extractSearchTerms,
    loadPdfDocument,
    recognizePdfPageRaw,
    runOcrAnalysis,
  }
}

describe('runOcrAnalysis', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/lib/pdf/load-document')
    vi.doUnmock('@/lib/pdf/ocr/recognize-page')
    vi.doUnmock('./search-chunking')
    vi.doUnmock('@/lib/kiwi/kiwi.client')
    vi.restoreAllMocks()
  })

  it('페이지를 번호 순서로 하나씩 OCR하고 저장한다', async () => {
    const {
      createSearchChunks,
      extractSearchTerms,
      loadPdfDocument,
      recognizePdfPageRaw,
      runOcrAnalysis,
    } = await createAnalysisStub()
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
    extractSearchTerms.mockResolvedValue([{ term: '검색', frequency: 3 }])
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdfData: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.storeOcrPage.mockResolvedValueOnce(false)
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
    store.storeOcrPage.mockResolvedValueOnce(true)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'ready' },
      { pageNumber: 2, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([
      { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 0, rawText: '원문' },
    ])

    await expect(runOcrAnalysis('book-id', store)).resolves.toBe('completed')

    expect(store.initializeOcrPages).toHaveBeenCalledWith('book-id')
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
      [{ ocrPageId: 'page-1', pageNumber: 1, lineIndex: 0, rawText: '원문' }],
      expect.any(AbortSignal),
    )
    expect(extractSearchTerms).toHaveBeenCalledWith('검색 청크', expect.any(AbortSignal))
    expect(store.storeSearchIndex).toHaveBeenCalledWith({
      bookId: 'book-id',
      chunks: [
        {
          id: 'chunk-1',
          ordinal: 0,
          text: '검색 청크',
          tokenCount: 2,
          sources: [],
          terms: [{ term: '검색', termFrequency: 3 }],
        },
      ],
    })
    expect(recognizePdfPageRaw).toHaveBeenCalledTimes(2)
    const signal = loadPdfDocument.mock.calls[0]?.[1]
    expect(extractSearchTerms.mock.calls[0]?.[1]).toBe(signal)
    expect(signal).toHaveProperty('aborted', true)
  })

  it('페이지 OCR 실패 후에도 남은 pending 페이지를 처리하고 분석을 실패 상태로 남긴다', async () => {
    const { loadPdfDocument, recognizePdfPageRaw, runOcrAnalysis } = await createAnalysisStub()
    loadPdfDocument.mockResolvedValue({ document: { numPages: 2, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValueOnce(new Error('OCR failed')).mockResolvedValueOnce({
      width: 100,
      height: 200,
      lines: [],
    })
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdfData: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
    store.storeOcrPage.mockResolvedValueOnce(false)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'failed' },
      { pageNumber: 2, width: null, height: null, status: 'ready' },
    ])

    await expect(runOcrAnalysis('book-id', store)).resolves.toBe('failed')

    expect(store.failOcrPage).toHaveBeenCalledWith('page-1')
    expect(store.prepareOcrPagesForRun).toHaveBeenCalledWith('book-id')
    expect(store.storeOcrPage).toHaveBeenCalledWith(expect.objectContaining({ pageId: 'page-2' }))
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
    expect(store.getOcrLinesForChunking).not.toHaveBeenCalledWith('book-id')
    expect(loadPdfDocument.mock.calls[0]?.[1]).toHaveProperty('aborted', true)
  })

  it('페이지 OCR 오류를 호출자에게 전달하면서 다음 페이지를 계속 처리한다', async () => {
    const { loadPdfDocument, recognizePdfPageRaw, runOcrAnalysis } = await createAnalysisStub()
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValueOnce(new Error('PaddleOCR model unavailable'))
    const onFailure = vi.fn()
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdfData: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-3', pageNumber: 3 })
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'failed' },
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
    const { createSearchChunks, loadPdfDocument, recognizePdfPageRaw, runOcrAnalysis } =
      await createAnalysisStub()
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockResolvedValue({ width: 100, height: 200, lines: [] })
    createSearchChunks.mockRejectedValueOnce(new Error('Kiwi failed'))
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdfData: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
    store.storeOcrPage.mockResolvedValueOnce(true)
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([])

    await runOcrAnalysis('book-id', store)

    expect(createSearchChunks).toHaveBeenCalledOnce()
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
    expect(store.storeSearchIndex).not.toHaveBeenCalled()
  })

  it('역색인 저장에 실패하면 분석을 실패 처리한다', async () => {
    const { createSearchChunks, extractSearchTerms, loadPdfDocument, runOcrAnalysis } =
      await createAnalysisStub()
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    createSearchChunks.mockResolvedValueOnce([
      { id: 'chunk-1', ordinal: 0, text: '검색 청크', tokenCount: 2, sources: [] },
    ])
    extractSearchTerms.mockResolvedValueOnce([{ term: '검색', frequency: 1 }])
    const store = createStoreMock()
    store.getBook.mockImplementation(async () => {
      return createStoredBookDetail({ pdfData: new Uint8Array([1]) })
    })
    store.acquireNextOcrPage.mockImplementation(async () => {
      return null
    })
    store.listOcrPages.mockImplementation(async () => {
      return [{ pageNumber: 1, width: null, height: null, status: 'ready' }]
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
    const { createSearchChunks, loadPdfDocument, recognizePdfPageRaw, runOcrAnalysis } =
      await createAnalysisStub()
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    createSearchChunks.mockResolvedValueOnce([])
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail({ pdfData: new Uint8Array([1]) }))
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([])

    await runOcrAnalysis('book-id', store)

    expect(recognizePdfPageRaw).not.toHaveBeenCalled()
    expect(createSearchChunks).toHaveBeenCalledOnce()
    expect(store.storeSearchIndex).toHaveBeenCalledWith({ bookId: 'book-id', chunks: [] })
  })

  it('Kiwi 검색어 추출에 실패하면 색인을 저장하지 않고 분석 실패를 전달한다', async () => {
    const { createSearchChunks, extractSearchTerms, loadPdfDocument, runOcrAnalysis } =
      await createAnalysisStub()
    loadPdfDocument.mockResolvedValueOnce({ document: { numPages: 1, getPage: vi.fn() } })
    createSearchChunks.mockResolvedValueOnce([
      { id: 'chunk-1', ordinal: 0, text: '검색 청크', tokenCount: 2, sources: [] },
    ])
    const error = new Error('검색어 추출 실패')
    extractSearchTerms.mockRejectedValueOnce(error)
    const onFailure = vi.fn()
    const store = createStoreMock()
    store.getBook.mockResolvedValueOnce(createStoredBookDetail())
    store.acquireNextOcrPage.mockResolvedValueOnce(null)
    store.listOcrPages.mockResolvedValueOnce([
      { pageNumber: 1, width: null, height: null, status: 'ready' },
    ])
    store.getOcrLinesForChunking.mockResolvedValueOnce([])

    await expect(runOcrAnalysis('book-id', store, { onFailure })).resolves.toBe('failed')

    expect(store.storeSearchIndex).not.toHaveBeenCalled()
    expect(store.failBookAnalysis).toHaveBeenCalledWith('book-id')
    expect(onFailure).toHaveBeenCalledWith({ bookId: 'book-id', error, stage: 'whole-analysis' })
    expect(extractSearchTerms.mock.calls[0]?.[1]).toHaveProperty('aborted', true)
  })
})
