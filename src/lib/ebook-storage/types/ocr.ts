import type { ocrLinesTable, ocrPagesTable } from '../schema'

type OcrLineRow = typeof ocrLinesTable.$inferSelect
type OcrPageRow = typeof ocrPagesTable.$inferSelect

type OcrPagePosition = Pick<OcrPageRow, 'id' | 'pageNumber'>
type OcrChunkingLine = Pick<OcrLineRow, 'ocrPageId' | 'lineIndex' | 'rawText'>

export type OcrLine = Omit<OcrLineRow, 'id' | 'ocrPageId' | 'lineIndex'>

export interface NextOcrPage extends OcrPagePosition {
  id: string
}

export interface OcrLineRecord extends OcrLine {
  pageNumber: OcrPageRow['pageNumber']
  lineIndex: OcrLineRow['lineIndex']
}

export interface OcrLinePage {
  lines: OcrLineRecord[]
  total: number
}

export interface OcrLineForChunking extends OcrChunkingLine {
  pageNumber: OcrPageRow['pageNumber']
}

export interface StoredOcrPage {
  width: number
  height: number
  lines: OcrLine[]
}

export type OcrPageRecord = Pick<OcrPageRow, 'pageNumber' | 'status' | 'width' | 'height'>

export interface OcrPageResult {
  pageId: string
  width: number
  height: number
  lines: readonly OcrLine[]
}

export interface OcrPageQuery {
  bookId: string
  pageNumber: number
}
