import { loadPdfDocument } from '@/features/reader/lib/pdf-document'
import { recognizePdfPageRaw } from '@/features/reader/lib/ocr/page-recognition'
import type { NextOcrPage } from '../../ebook-types'
import type { EbookLibraryStore } from '../ebook-library-store'

interface StoredPdf {
  pdf_data: Uint8Array
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

class RetryableOcrError extends Error {}

export async function runOcrAnalysis(bookId: string, store: EbookLibraryStore): Promise<void> {
  try {
    const storedBook = await store.request('getBook', bookId)
    if (!isStoredPdf(storedBook)) throw new Error('Stored PDF is unavailable')

    const controller = new AbortController()
    const loaded = await loadPdfDocument(storedBook.pdf_data, controller.signal)

    // 1. PDF 페이지 수를 보고 OCR 페이지를 초기화한다.
    await store.request('initializeOcrPages', { bookId, pageCount: loaded.document.numPages })

    // 2. 만약 페이지 중 OCR이 중단된 페이지가 있다면, 해당 페이지를 복구한다.
    await store.request('recoverInterruptedOcrPages', bookId)

    for (;;) {
      // 3. 다음 OCR 페이지를 하나씩 선택한다.
      const nextOcrPage = await store.request('acquireNextOcrPage', bookId)
      if (nextOcrPage === null) return
      if (!isNextOcrPage(nextOcrPage)) throw new Error('Invalid next OCR page')

      try {
        const page = await loaded.document.getPage(nextOcrPage.pageNumber)
        const result = await recognizePdfPageRaw(page, controller.signal)

        // 4. OCR 결과를 저장한다. 기존 Line 데이터를 모두 삭제하고 새로 저장한다.
        await store.request('storeOcrPage', {
          pageId: nextOcrPage.id,
          width: result.width,
          height: result.height,
          lines: result.lines.map(({ text, bbox }) => ({ rawText: text, ...bbox })),
        })
      } catch (error) {
        // 5. OCR 페이지 인식에 실패하면, 해당 페이지를 실패 처리
        await store.request('failOcrPage', nextOcrPage.id)
        throw new RetryableOcrError('OCR page recognition failed', { cause: error })
      }
    }
  } catch (error) {
    // 페이지 실패에 대해서는 전체 책 에러로 판단하지 않는다.
    if (error instanceof RetryableOcrError) return

    // 6. 만약 전체 책 OCR 분석에 실패하면, 책 분석 상태를 failed로 남긴다.
    await store.request('failBookAnalysis', bookId)
  }
}
