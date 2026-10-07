// PDF의 1/72인치 포인트를 CSS의 1/96인치 픽셀 기준으로 변환하는 배율이다.
export const PDF_CSS_SCALE = 96 / 72

export interface PdfPageViewport {
  width: number
  height: number
  rotation: number
}

export interface PdfPageHandle {
  getViewport(parameters: { scale: number }): PdfPageViewport
}

export interface PdfPointViewport extends PdfPageViewport {
  convertToViewportPoint(x: number, y: number): [number, number]
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

export type PdfDocumentSource = string | Uint8Array

export type PdfDocumentLoader = (
  source: PdfDocumentSource,
  signal: AbortSignal,
) => Promise<LoadedPdfDocument>
