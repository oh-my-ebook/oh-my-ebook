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

export async function runOcrAnalysis(bookId: string, store: EbookLibraryStore): Promise<void> {
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
      } catch {
        // 5. OCR 페이지 인식에 실패하면 해당 페이지만 실패 처리하고 다음 페이지로 넘어간다.
        await store.request('failOcrPage', nextOcrPage.id)
      }
    }
  } catch {
    // 6. 만약 전체 책 OCR 분석에 실패하면, 책 분석 상태를 failed로 남긴다.
    await store.request('failBookAnalysis', bookId)
  } finally {
    controller.abort()
  }
}
