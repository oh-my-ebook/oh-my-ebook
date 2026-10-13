import { vi } from 'vitest'
import type { EbookStore } from '@/lib/ebook-storage/ebook-store'
import type { StoredBook, StoredBookDetail } from '@/lib/ebook-storage/types/book'

export function createStoredBook(overrides: Partial<StoredBook> = {}): StoredBook {
  return {
    id: 'book-id',
    content_hash: 'a'.repeat(64),
    file_name: 'book.pdf',
    title: '책',
    author: null,
    pdf_title: null,
    pdf_subject: null,
    pdf_keywords: null,
    publisher: null,
    pdf_size: 3,
    page_count: 2,
    cover_data: null,
    cover_mime: null,
    cover_status: 'fallback',
    pdf_status: 'available',
    last_page: null,
    analysis_status: 'ready',
    ocr_completed_at: null,
    indexed_at: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

export function createStoredBookDetail(
  overrides: Partial<StoredBookDetail> = {},
): StoredBookDetail {
  return { ...createStoredBook(), pdf_data: new Uint8Array([1, 2, 3]), ...overrides }
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
