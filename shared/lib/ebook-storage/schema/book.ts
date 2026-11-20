import { sql } from 'drizzle-orm'
import { check, index, integer, snakeCase, text } from 'drizzle-orm/sqlite-core'
import { bytes, timestamps } from './common'

export const bookAnalysisStatuses = ['analyzing', 'ready', 'failed'] as const
export type BookAnalysisStatus = (typeof bookAnalysisStatuses)[number]

export const bookCoverMimeTypes = ['image/webp', 'image/png'] as const

export const bookFileColumns = {
  contentHash: text().notNull().unique(),
  fileName: text().notNull(),
  title: text().notNull(),
  author: text(),
  pdfTitle: text(),
  pdfSubject: text(),
  pdfKeywords: text(),
  publisher: text(),
  pdfSize: integer().notNull(),
  pageCount: integer().notNull(),
}

export const bookCoverColumns = {
  coverData: bytes(),
  coverMime: text({ enum: bookCoverMimeTypes }),
}

/**
 * 책의 메타데이터와 읽기·분석 상태. PDF 원본은 OPFS에 별도로 저장한다.
 * - id: 앱에서 발급하는 책 식별자.
 * - contentHash: 중복 판별과 PDF 파일 경로에 쓰는 원본 파일의 SHA-256 해시.
 * - fileName: 가져온 PDF의 파일 이름.
 * - title: 화면에 표시하는 제목. 사용자가 수정할 수 있다.
 * - author: PDF 메타데이터에서 읽은 저자.
 * - pdfTitle: PDF 메타데이터의 원래 제목. 표시 제목과 별도로 보관한다.
 * - pdfSubject: PDF 메타데이터의 주제.
 * - pdfKeywords: PDF 메타데이터의 키워드 문자열.
 * - publisher: PDF 메타데이터에서 읽은 출판사.
 * - pdfSize: 원본 PDF 크기(바이트).
 * - pageCount: 전체 페이지 수.
 * - coverData: 표지 이미지 바이트. 이미지가 없으면 NULL.
 * - coverMime: 표지 이미지의 MIME 타입. 이미지가 없으면 NULL.
 * - lastPage: 마지막 읽기 위치(1부터 시작). 저장된 위치가 없으면 NULL.
 * - analysisStatus: OCR·검색 인덱스 분석 중(analyzing), 완료(ready), 실패(failed).
 * - ocrCompletedAt: 전체 페이지 OCR 완료 시각. 미완료이면 NULL.
 * - indexedAt: 검색 인덱스 저장 완료 시각. 미완료이면 NULL.
 * - createdAt / updatedAt: 책 등록 시각 / 저장 정보 갱신 시각.
 * 시각은 모두 Unix epoch 기준 밀리초이며 앱에서 기록한다.
 */
export const booksTable = snakeCase.table(
  'books',
  {
    id: text().primaryKey().notNull(),
    ...bookFileColumns,
    lastPage: integer(),
    analysisStatus: text({ enum: bookAnalysisStatuses }).notNull(),
    ...bookCoverColumns,
    ocrCompletedAt: integer(),
    indexedAt: integer(),
    ...timestamps,
  },
  (table) => [
    index('books_created_at_idx').on(sql`${table.createdAt} DESC`, sql`${table.id} DESC`),
    check('books_pdf_size_check', sql`${table.pdfSize} >= 0`),
    check('books_page_count_check', sql`${table.pageCount} > 0`),
    check(
      'books_last_page_check',
      sql`${table.lastPage} IS NULL OR (${table.lastPage} >= 1 AND ${table.lastPage} <= ${table.pageCount})`,
    ),
    check(
      'books_analysis_status_check',
      sql`${table.analysisStatus} IN ('analyzing', 'ready', 'failed')`,
    ),
  ],
)

export const bookDetailsColumns = {
  id: booksTable.id,
  contentHash: booksTable.contentHash,
  fileName: booksTable.fileName,
  title: booksTable.title,
  author: booksTable.author,
  pdfTitle: booksTable.pdfTitle,
  pdfSubject: booksTable.pdfSubject,
  pdfKeywords: booksTable.pdfKeywords,
  publisher: booksTable.publisher,
  pdfSize: booksTable.pdfSize,
  pageCount: booksTable.pageCount,
  lastPage: booksTable.lastPage,
  analysisStatus: booksTable.analysisStatus,
}
