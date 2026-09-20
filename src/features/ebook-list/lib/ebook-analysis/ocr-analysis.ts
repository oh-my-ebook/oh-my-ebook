import { loadPdfDocument } from '@/features/reader/lib/pdf-document'
import { recognizePdfPageRaw } from '@/features/reader/lib/ocr/page-recognition'
import type { NextOcrPage, OcrLineForChunking } from '../../ebook-types'
import type { EbookLibraryStore } from '../ebook-library-store'
import { createSearchChunks } from './search-chunking'

interface StoredPdf {
  pdf_data: Uint8Array
}

export interface OcrAnalysisFailure {
  bookId: string
  error: unknown
  pageNumber?: number
  stage: 'page-ocr' | 'whole-analysis'
}

export type OcrAnalysisResult = 'completed' | 'failed'

interface OcrAnalysisOptions {
  onFailure?(failure: OcrAnalysisFailure): void
}

function isStoredPdf(value: unknown): value is StoredPdf {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pdf_data' in value &&
    value.pdf_data instanceof Uint8Array
  )
}

function isNextOcrPage(value: unknown): value is NextOcrPage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'pageNumber' in value &&
    typeof value.pageNumber === 'number'
  )
}

function isOcrLineForChunking(value: unknown): value is OcrLineForChunking {
  if (typeof value !== 'object') return false
  if (value === null) return false
  if (!('ocr_page_id' in value)) return false
  if (typeof value.ocr_page_id !== 'string') return false
  if (!('page_number' in value)) return false
  if (typeof value.page_number !== 'number') return false
  if (!('line_index' in value)) return false
  if (typeof value.line_index !== 'number') return false
  if (!('raw_text' in value)) return false
  if (typeof value.raw_text !== 'string') return false
  return true
}

function isOcrLinesForChunking(value: unknown): value is OcrLineForChunking[] {
  if (!Array.isArray(value)) return false
  return value.every(isOcrLineForChunking)
}

function isReadyOcrPage(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && 'status' in value && value.status === 'ready'
  )
}

function reportFailure(options: OcrAnalysisOptions, failure: OcrAnalysisFailure) {
  options.onFailure?.(failure)
}

export async function runOcrAnalysis(
  bookId: string,
  store: EbookLibraryStore,
  options: OcrAnalysisOptions = {},
): Promise<OcrAnalysisResult> {
  const controller = new AbortController()

  try {
    const storedBook = await store.request('getBook', bookId)
    if (!isStoredPdf(storedBook)) throw new Error('Stored PDF is unavailable')

    const loaded = await loadPdfDocument(storedBook.pdf_data, controller.signal)

    // 1. PDF 페이지 수를 보고 OCR 페이지를 초기화한다.
    await store.request('initializeOcrPages', { bookId, pageCount: loaded.document.numPages })

    // 2. 중단되었거나 이전에 실패한 OCR 페이지를 다시 실행할 수 있게 준비한다.
    await store.request('prepareOcrPagesForRun', bookId)

    for (;;) {
      // 3. 다음 OCR 페이지를 하나씩 선택한다.
      const nextOcrPage = await store.request('acquireNextOcrPage', bookId)
      if (nextOcrPage === null) {
        const ocrPages = await store.request('listOcrPages', bookId)
        if (!Array.isArray(ocrPages) || !ocrPages.every(isReadyOcrPage)) {
          throw new Error('OCR을 완료하지 못한 페이지가 있습니다.')
        }

        const ocrLines = await store.request('getOcrLinesForChunking', bookId)
        if (!isOcrLinesForChunking(ocrLines)) throw new Error('Invalid OCR lines for chunking')
        const chunks = await createSearchChunks(ocrLines, controller.signal)
        await store.request('storeSearchChunks', { bookId, chunks })
        return 'completed'
      }
      if (!isNextOcrPage(nextOcrPage)) throw new Error('Invalid next OCR page')

      try {
        const page = await loaded.document.getPage(nextOcrPage.pageNumber)
        const result = await recognizePdfPageRaw(page, controller.signal)

        // 4. OCR 결과를 저장한다. 기존 Line 데이터를 모두 삭제하고 새로 저장한다.
        const storedOcrPage = await store.request('storeOcrPage', {
          pageId: nextOcrPage.id,
          width: result.width,
          height: result.height,
          lines: result.lines.map(({ text, bbox }) => ({ rawText: text, ...bbox })),
        })
        if (storedOcrPage !== true && storedOcrPage !== false)
          throw new Error('Invalid OCR page storage result')
      } catch (error) {
        // 5. OCR 페이지 인식에 실패하면 해당 페이지만 실패 처리하고 다음 페이지로 넘어간다.
        reportFailure(options, {
          bookId,
          error,
          pageNumber: nextOcrPage.pageNumber,
          stage: 'page-ocr',
        })
        await store.request('failOcrPage', nextOcrPage.id)
        continue
      }
    }
  } catch (error) {
    // 6. 만약 전체 책 OCR 분석에 실패하면, 책 분석 상태를 failed로 남긴다.
    reportFailure(options, { bookId, error, stage: 'whole-analysis' })
    await store.request('failBookAnalysis', bookId)
    return 'failed'
  } finally {
    controller.abort()
  }
}
