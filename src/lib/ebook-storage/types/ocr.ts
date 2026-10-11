import type { ocrLines, ocrPages } from '../schema'

type OcrLineRow = typeof ocrLines.$inferSelect
type OcrPageRow = typeof ocrPages.$inferSelect

export type OcrLineInput = Pick<OcrLineRow, 'rawText' | 'x0' | 'y0' | 'x1' | 'y1'>

export interface NextOcrPage extends Pick<OcrPageRow, 'pageNumber'> {
  id: string
}

export interface OcrLineRecord extends Omit<OcrLineRow, 'id' | 'ocrPageId'> {
  pageNumber: OcrPageRow['pageNumber']
}

export interface OcrLinePage {
  lines: OcrLineRecord[]
  total: number
}

export interface OcrLineForChunking extends Pick<
  OcrLineRow,
  'ocrPageId' | 'lineIndex' | 'rawText'
> {
  pageNumber: OcrPageRow['pageNumber']
}

export interface StoredOcrPage {
  width: number
  height: number
  lines: OcrLineInput[]
}

export type OcrPageRecord = Pick<OcrPageRow, 'pageNumber' | 'status' | 'width' | 'height'>
