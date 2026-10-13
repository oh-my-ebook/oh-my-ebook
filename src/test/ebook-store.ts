import { vi } from 'vitest'
import type { EbookStore } from '@/lib/ebook-storage/ebook-store'
import type { StoredBook, StoredBookDetail } from '@/lib/ebook-storage/types/book'

export function createStoredBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book-id',
    contentHash: 'a'.repeat(64),
    fileName: 'book.pdf',
    title: '책',
    author: null,
    pdfTitle: null,
    pdfSubject: null,
    pdfKeywords: null,
    publisher: null,
    pdfSize: 3,
    pageCount: 2,
    coverData: null,
    coverMime: null,
    coverStatus: 'fallback',
    pdfStatus: 'available',
    lastPage: null,
    analysisStatus: 'ready',
    ocrCompletedAt: null,
    indexedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

export function createStoredBookDetail(
  overrides: Partial<StoredBookDetail> = {},
): StoredBookDetail {
  return { ...createStoredBook(), pdfData: new Uint8Array([1, 2, 3]), ...overrides }
}

export function createStoreMock() {
  return {
    initialize: vi.fn<EbookStore['initialize']>(async () => undefined),
    clearStorage: vi.fn<EbookStore['clearStorage']>(async () => undefined),
    saveBook: vi.fn<EbookStore['saveBook']>(async () => 'saved-id'),
    getBook: vi.fn<EbookStore['getBook']>(async () => createStoredBookDetail()),
    deleteBook: vi.fn<EbookStore['deleteBook']>(async () => undefined),
    listBooks: vi.fn<EbookStore['listBooks']>(async () => []),
    hasBook: vi.fn<EbookStore['hasBook']>(async () => undefined),
    updateProgress: vi.fn<EbookStore['updateProgress']>(async () => undefined),
    updateTitle: vi.fn<EbookStore['updateTitle']>(async () => undefined),
    updateCover: vi.fn<EbookStore['updateCover']>(async () => undefined),
    initializeOcrPages: vi.fn<EbookStore['initializeOcrPages']>(async () => undefined),
    prepareOcrPagesForRun: vi.fn<EbookStore['prepareOcrPagesForRun']>(async () => undefined),
    acquireNextOcrPage: vi.fn<EbookStore['acquireNextOcrPage']>(async () => null),
    storeOcrPage: vi.fn<EbookStore['storeOcrPage']>(async () => false),
    failOcrPage: vi.fn<EbookStore['failOcrPage']>(async () => undefined),
    failBookAnalysis: vi.fn<EbookStore['failBookAnalysis']>(async () => undefined),
    getBookAnalysisStatus: vi.fn<EbookStore['getBookAnalysisStatus']>(async () => 'ready'),
    retryBookAnalysis: vi.fn<EbookStore['retryBookAnalysis']>(async () => undefined),
    getStoredOcrPage: vi.fn<EbookStore['getStoredOcrPage']>(async () => null),
    listOcrPages: vi.fn<EbookStore['listOcrPages']>(async () => []),
    listOcrLines: vi.fn<EbookStore['listOcrLines']>(async () => ({ lines: [], total: 0 })),
    getOcrLinesForChunking: vi.fn<EbookStore['getOcrLinesForChunking']>(async () => []),
    storeSearchIndex: vi.fn<EbookStore['storeSearchIndex']>(async () => undefined),
    listSearchChunks: vi.fn<EbookStore['listSearchChunks']>(async () => ({ chunks: [], total: 0 })),
    searchChunks: vi.fn<EbookStore['searchChunks']>(async () => []),
    listSearchTerms: vi.fn<EbookStore['listSearchTerms']>(async () => ({ terms: [], total: 0 })),
    listSearchPostings: vi.fn<EbookStore['listSearchPostings']>(async () => ({
      postings: [],
      total: 0,
    })),
    listChunkSources: vi.fn<EbookStore['listChunkSources']>(async () => ({
      sources: [],
      total: 0,
    })),
  }
}
