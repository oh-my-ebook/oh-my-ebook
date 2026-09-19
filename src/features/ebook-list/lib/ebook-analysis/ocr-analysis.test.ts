import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EbookLibraryStore } from '../ebook-library-store'

const { loadPdfDocument, recognizePdfPageRaw } = vi.hoisted(() => ({
  loadPdfDocument: vi.fn(),
  recognizePdfPageRaw: vi.fn(),
}))

vi.mock('@/features/reader/lib/pdf-document', () => ({ loadPdfDocument }))
vi.mock('@/features/reader/lib/ocr/page-recognition', () => ({ recognizePdfPageRaw }))

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
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pdf_data: new Uint8Array([1]) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce({ id: 'page-2', pageNumber: 2 })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null)
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    await runOcrAnalysis('book-id', store)

    expect(request).toHaveBeenNthCalledWith(2, 'initializeOcrPages', {
      bookId: 'book-id',
      pageCount: 2,
    })
    expect(request).toHaveBeenNthCalledWith(3, 'recoverInterruptedOcrPages', 'book-id')
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
    expect(recognizePdfPageRaw).toHaveBeenCalledTimes(2)
    expect(abort).toHaveBeenCalledOnce()
  })

  it('페이지 OCR 실패는 failed로 남겨 다음 실행에서 재개할 수 있게 한다', async () => {
    const abort = vi.spyOn(AbortController.prototype, 'abort')
    loadPdfDocument.mockResolvedValue({ document: { numPages: 1, getPage: vi.fn() } })
    recognizePdfPageRaw.mockRejectedValue(new Error('OCR failed'))
    const request = vi
      .fn()
      .mockResolvedValueOnce({ pdf_data: new Uint8Array([1]) })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'page-1', pageNumber: 1 })
      .mockResolvedValueOnce(undefined)
    const store = { request, saveBook: vi.fn() } as unknown as EbookLibraryStore

    await runOcrAnalysis('book-id', store)

    expect(request).toHaveBeenLastCalledWith('failOcrPage', 'page-1')
    expect(request).not.toHaveBeenCalledWith('failBookAnalysis', 'book-id')
    expect(abort).toHaveBeenCalledOnce()
  })
})
