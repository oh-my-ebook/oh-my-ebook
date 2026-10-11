import type { ocrLines, ocrPages } from '../schema'

type OcrLineRow = typeof ocrLines.$inferSelect
type OcrPageRow = typeof ocrPages.$inferSelect

type OcrPagePosition = Pick<OcrPageRow, 'id' | 'pageNumber'>
type OcrChunkingLine = Pick<OcrLineRow, 'ocrPageId' | 'lineIndex' | 'rawText'>

export type OcrLineInput = Omit<OcrLineRow, 'id' | 'ocrPageId' | 'lineIndex'>

export interface NextOcrPage extends OcrPagePosition {
  id: string
}

export interface OcrLineRecord extends OcrLineInput {
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
  lines: OcrLineInput[]
}

export type OcrPageRecord = Pick<OcrPageRow, 'pageNumber' | 'status' | 'width' | 'height'>
