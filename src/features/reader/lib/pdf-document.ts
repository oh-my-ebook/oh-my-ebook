import {
  GlobalWorkerOptions,
  InvalidPDFException,
  PasswordException,
  getDocument,
} from 'pdfjs-dist'

// Vite의 `?url`로 현재 PDF.js 패키지에 포함된 worker 파일의 배포 URL을 가져온다.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// PDF.js가 문서 분석을 별도 worker에서 수행하도록 worker 스크립트 경로를 지정한다.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// PDF의 1/72인치 포인트를 CSS의 1/96인치 픽셀 기준으로 변환하는 배율이다.
export const PDF_CSS_SCALE = 96 / 72

export type PdfDocumentErrorKind =
  'invalid-document' | 'load-failed' | 'page-info' | 'password-required'

const errorMessages: Record<PdfDocumentErrorKind, string> = {
  'invalid-document': '손상되었거나 올바르지 않은 PDF입니다.',
  'load-failed': 'PDF를 불러오지 못했습니다.',
  'page-info': 'PDF 페이지 정보를 불러오지 못했습니다.',
  'password-required': '암호가 필요한 PDF는 열 수 없습니다.',
}

export class PdfDocumentError extends Error {
  readonly kind: PdfDocumentErrorKind

  constructor(kind: PdfDocumentErrorKind, cause?: unknown) {
    super(errorMessages[kind], { cause })
    this.name = 'PdfDocumentError'
    this.kind = kind
  }
}

export interface PdfPageViewport {
  width: number
  height: number
  rotation: number
}

export interface PdfPageHandle {
  getViewport(parameters: { scale: number }): PdfPageViewport
}

export interface PdfDocumentHandle {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfPageHandle>
}

export interface PdfPageInfo {
  pageNumber: number
  width: number
  height: number
  rotation: number
}

export interface LoadedPdfDocument {
  document: PdfDocumentHandle
  pages: readonly PdfPageInfo[]
}

export type PdfDocumentLoader = (url: string, signal: AbortSignal) => Promise<LoadedPdfDocument>

/** `instanceof` 대신 오류 객체의 `name`이 예상한 PDF.js 오류 이름과 일치하는지 안전하게 확인한다. */
function hasErrorName(error: unknown, expectedName: string) {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === expectedName
  )
}

/** PDF.js 오류를 화면에서 처리할 수 있는 애플리케이션 오류 종류인 `PdfDocumentError`로 변환한다. */
export function toPdfDocumentError(error: unknown) {
  if (error instanceof PdfDocumentError) {
    return error
  }
  if (error instanceof PasswordException || hasErrorName(error, 'PasswordException')) {
    return new PdfDocumentError('password-required', error)
  }
  if (error instanceof InvalidPDFException || hasErrorName(error, 'InvalidPDFException')) {
    return new PdfDocumentError('invalid-document', error)
  }
  return new PdfDocumentError('load-failed', error)
}

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
export const loadPdfDocument: PdfDocumentLoader = async (url, signal) => {
  signal.throwIfAborted()
  const loadingTask = getDocument({ url })
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
