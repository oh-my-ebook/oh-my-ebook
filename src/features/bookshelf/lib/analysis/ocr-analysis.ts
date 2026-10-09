import { extractSearchTermsWithKiwi } from '@/lib/kiwi/client'
import { loadPdfDocument } from '@/lib/pdf/load-document'
import { recognizePdfPageRaw } from '@/lib/pdf/ocr/recognize-page'
import type { BookshelfStore } from '../bookshelf-store'
import { createSearchChunks } from './search-chunking'

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

function reportFailure(options: OcrAnalysisOptions, failure: OcrAnalysisFailure) {
  options.onFailure?.(failure)
}

export async function runOcrAnalysis(
  bookId: string,
  store: BookshelfStore,
  options: OcrAnalysisOptions = {},
): Promise<OcrAnalysisResult> {
  const controller = new AbortController()

  try {
    const storedBook = await store.getBook(bookId)

    const loaded = await loadPdfDocument(storedBook.pdf_data, controller.signal)

    // 1. PDF 페이지 수를 보고 OCR 페이지를 초기화한다.
    await store.initializeOcrPages({ bookId, pageCount: loaded.document.numPages })

    // 2. 중단되었거나 이전에 실패한 OCR 페이지를 다시 실행할 수 있게 준비한다.
    await store.prepareOcrPagesForRun(bookId)

    for (;;) {
      // 3. 다음 OCR 페이지를 하나씩 선택한다.
      const nextOcrPage = await store.acquireNextOcrPage(bookId)
      if (nextOcrPage === null) {
        const ocrPages = await store.listOcrPages(bookId)
        if (!ocrPages.every((page) => page.status === 'ready')) {
          throw new Error('OCR을 완료하지 못한 페이지가 있습니다.')
        }

        const ocrLines = await store.getOcrLinesForChunking(bookId)
        const chunks = await createSearchChunks(ocrLines, controller.signal)
        const indexedChunks = []
        for (const chunk of chunks) {
          indexedChunks.push({
            ...chunk,
            terms: await extractSearchTermsWithKiwi(chunk.text, controller.signal),
          })
        }
        await store.storeSearchIndex({ bookId, chunks: indexedChunks })
        return 'completed'
      }

      try {
        const page = await loaded.document.getPage(nextOcrPage.pageNumber)
        const result = await recognizePdfPageRaw(page, controller.signal)

        // 4. OCR 결과를 저장한다. 기존 Line 데이터를 모두 삭제하고 새로 저장한다.
        await store.storeOcrPage({
          pageId: nextOcrPage.id,
          width: result.width,
          height: result.height,
          lines: result.lines.map(({ text, bbox }) => ({ rawText: text, ...bbox })),
        })
      } catch (error) {
        // 5. OCR 페이지 인식에 실패하면 해당 페이지만 실패 처리하고 다음 페이지로 넘어간다.
        reportFailure(options, {
          bookId,
          error,
          pageNumber: nextOcrPage.pageNumber,
          stage: 'page-ocr',
        })
        await store.failOcrPage(nextOcrPage.id)
        continue
      }
    }
  } catch (error) {
    // 6. 만약 전체 책 OCR 분석에 실패하면, 책 분석 상태를 failed로 남긴다.
    reportFailure(options, { bookId, error, stage: 'whole-analysis' })
    await store.failBookAnalysis(bookId)
    return 'failed'
  } finally {
    controller.abort()
  }
}
