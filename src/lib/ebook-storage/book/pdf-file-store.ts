export interface PdfFileStore {
  writePdf(contentHash: string, pdfData: ArrayBuffer): Promise<void>
  readPdf(contentHash: string): Promise<Uint8Array>
  hasPdf(contentHash: string): Promise<boolean>
  deletePdf(contentHash: string): Promise<void>
}
