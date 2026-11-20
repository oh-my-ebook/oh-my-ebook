import type { InferModelFromColumns } from 'drizzle-orm'
import type {
  nextOcrPageColumns,
  ocrLineContentColumns,
  ocrLineForChunkingColumns,
  ocrLineRecordColumns,
  ocrLinesTable,
  ocrPagesTable,
  ocrPageStateColumns,
} from '../schema/ocr'

export type OcrLine = typeof ocrLinesTable.$inferSelect
export type OcrPage = typeof ocrPagesTable.$inferSelect
export type InsertOcrPage = typeof ocrPagesTable.$inferInsert

export type OcrLineContent = Pick<OcrLine, keyof typeof ocrLineContentColumns>
export type NextOcrPage = InferModelFromColumns<typeof nextOcrPageColumns>

export interface OcrLinePage {
  lines: InferModelFromColumns<typeof ocrLineRecordColumns>[]
  total: number
}

export type OcrLineForChunking = InferModelFromColumns<typeof ocrLineForChunkingColumns>

export interface StoredOcrPage {
  width: number
  height: number
  lines: OcrLineContent[]
}

export type OcrPageRecord = Pick<OcrPage, keyof typeof ocrPageStateColumns>

export interface OcrPageResult {
  pageId: string
  width: number
  height: number
  lines: readonly OcrLineContent[]
}

export interface OcrPageQuery {
  bookId: string
  pageNumber: number
}
