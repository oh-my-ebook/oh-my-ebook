import { sql } from 'drizzle-orm'
import { check, index, integer, real, snakeCase, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { booksTable } from './book'
import { timestamps } from './common'

export const ocrPageStatuses = ['pending', 'processing', 'ready', 'failed'] as const
export type OcrPageStatus = (typeof ocrPageStatuses)[number]

export const ocrPageStateColumns = {
  pageNumber: integer().notNull(),
  width: integer(),
  height: integer(),
  status: text({ enum: ocrPageStatuses }).notNull().default('pending'),
}

export const ocrLineContentColumns = {
  rawText: text().notNull(),
  x0: real().notNull(),
  y0: real().notNull(),
  x1: real().notNull(),
  y1: real().notNull(),
}

/**
 * 책의 페이지별 OCR 진행 상태와 인식 이미지 크기.
 * - id: OCR 페이지 식별자.
 * - bookId: 이 페이지가 속한 책의 id.
 * - pageNumber: PDF 페이지 번호(1부터 시작).
 * - width / height: OCR에 사용한 이미지의 너비 / 높이(픽셀). 결과 저장 전에는 NULL.
 * - status: 대기(pending), 처리 중(processing), 완료(ready), 실패(failed).
 * - createdAt / updatedAt: OCR 작업 등록 시각 / 상태·결과 갱신 시각(Unix epoch 밀리초).
 */
export const ocrPagesTable = snakeCase.table(
  'ocr_pages',
  {
    id: text().primaryKey().notNull(),
    bookId: text()
      .notNull()
      .references(() => booksTable.id, { onDelete: 'cascade' }),
    ...ocrPageStateColumns,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('ocr_pages_book_page_idx').on(table.bookId, table.pageNumber),
    index('ocr_pages_resume_idx').on(table.bookId, table.status, table.pageNumber),
    check('ocr_pages_page_number_check', sql`${table.pageNumber} > 0`),
    check('ocr_pages_width_check', sql`${table.width} IS NULL OR ${table.width} > 0`),
    check('ocr_pages_height_check', sql`${table.height} IS NULL OR ${table.height} > 0`),
    check(
      'ocr_pages_status_check',
      sql`${table.status} IN ('pending', 'processing', 'ready', 'failed')`,
    ),
  ],
)

/**
 * OCR로 인식한 줄의 원문과 위치. 읽기 순서와 검색 결과의 출처를 복원하는 데 쓴다.
 * - id: SQLite가 자동 할당하는 줄 식별자.
 * - ocrPageId: 이 줄이 속한 OCR 페이지의 id.
 * - lineIndex: 페이지 안에서 읽기 순서로 정렬한 줄 번호(0부터 시작).
 * - rawText: Kiwi 후처리 전 OCR 인식 문자열.
 * - x0 / y0: 줄 영역의 왼쪽 위 좌표.
 * - x1 / y1: 줄 영역의 오른쪽 아래 좌표.
 * 좌표는 OCR 이미지의 왼쪽 위를 원점으로 한 픽셀 단위다.
 */
export const ocrLinesTable = snakeCase.table(
  'ocr_lines',
  {
    id: integer().primaryKey(),
    ocrPageId: text()
      .notNull()
      .references(() => ocrPagesTable.id, { onDelete: 'cascade' }),
    lineIndex: integer().notNull(),
    ...ocrLineContentColumns,
  },
  (table) => [
    uniqueIndex('ocr_lines_page_order_idx').on(table.ocrPageId, table.lineIndex),
    check('ocr_lines_x1_check', sql`${table.x1} > ${table.x0}`),
    check('ocr_lines_y1_check', sql`${table.y1} > ${table.y0}`),
  ],
)

export const nextOcrPageColumns = {
  id: ocrPagesTable.id,
  pageNumber: ocrPagesTable.pageNumber,
}

export const ocrLineRecordColumns = {
  pageNumber: ocrPagesTable.pageNumber,
  lineIndex: ocrLinesTable.lineIndex,
  rawText: ocrLinesTable.rawText,
  x0: ocrLinesTable.x0,
  y0: ocrLinesTable.y0,
  x1: ocrLinesTable.x1,
  y1: ocrLinesTable.y1,
}

export const ocrLineForChunkingColumns = {
  ocrPageId: ocrLinesTable.ocrPageId,
  pageNumber: ocrPagesTable.pageNumber,
  lineIndex: ocrLinesTable.lineIndex,
  rawText: ocrLinesTable.rawText,
}
