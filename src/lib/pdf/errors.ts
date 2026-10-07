import { InvalidPDFException, PasswordException } from 'pdfjs-dist'

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
