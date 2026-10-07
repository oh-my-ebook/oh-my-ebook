import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
// Vite의 `?url`로 현재 PDF.js 패키지에 포함된 worker 파일의 배포 URL을 가져온다.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  PDF_CSS_SCALE,
  type LoadedPdfDocument,
  type PdfDocumentHandle,
  type PdfDocumentLoader,
  type PdfPageInfo,
} from './document'
import { PdfDocumentError, toPdfDocumentError } from './errors'

// PDF.js가 문서 분석을 별도 worker에서 수행하도록 worker 스크립트 경로를 지정한다.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** PDF의 모든 페이지에서 렌더링에 필요한 크기와 회전 정보를 수집한다. */
async function preparePdfDocument(document: PdfDocumentHandle): Promise<LoadedPdfDocument> {
  const pages: PdfPageInfo[] = []

  try {
    // 렌더링 전에 모든 페이지의 크기와 회전값을 CSS 픽셀 기준으로 수집한다.
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: PDF_CSS_SCALE })
      if (
        !Number.isFinite(viewport.width) ||
        viewport.width <= 0 ||
        !Number.isFinite(viewport.height) ||
        viewport.height <= 0 ||
        !Number.isFinite(viewport.rotation)
      ) {
        throw new Error(`Invalid page viewport for page ${pageNumber}`)
      }
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      })
    }
  } catch (error) {
    throw new PdfDocumentError('page-info', error)
  }

  return { document, pages }
}

/** URL의 PDF를 불러오고 취소 신호에 맞춰 로딩 작업과 자원을 정리한다. */
export const loadPdfDocument: PdfDocumentLoader = async (source, signal) => {
  signal.throwIfAborted()
  // PDF.js는 자체 Worker로 Uint8Array 버퍼를 전송한다. 개발 모드의 effect 재실행과
  // 재시도에서도 같은 원본을 안전하게 사용할 수 있도록 전송용 사본을 만든다.
  const documentSource = typeof source === 'string' ? { url: source } : { data: source.slice() }
  const loadingTask = getDocument(documentSource)
  let destroyPromise: Promise<void> | undefined
  // 취소와 오류 처리가 겹쳐도 PDF.js 로딩 작업은 한 번만 정리한다.
  const destroy = async () => {
    destroyPromise ??= loadingTask.destroy()
    await destroyPromise
  }
  const handleAbort = () => {
    void destroy().catch(() => undefined)
  }

  signal.addEventListener('abort', handleAbort, { once: true })

  try {
    const document = await loadingTask.promise
    signal.throwIfAborted()
    const loadedDocument = await preparePdfDocument(document)
    signal.throwIfAborted()
    return loadedDocument
  } catch (error) {
    // 이후의 abort 이벤트가 이미 끝난 로딩 작업을 다시 정리하지 않도록 구독을 해제한다.
    signal.removeEventListener('abort', handleAbort)

    let cleanupError: unknown
    try {
      await destroy()
    } catch (destroyError) {
      cleanupError = destroyError
    }

    signal.throwIfAborted()
    const documentError = toPdfDocumentError(error)
    if (cleanupError !== undefined) {
      // 원래 로딩 오류와 정리 중 발생한 오류를 모두 원인으로 남긴다.
      throw new PdfDocumentError(
        documentError.kind,
        new AggregateError([documentError, cleanupError]),
      )
    }
    throw documentError
  }
}
