import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// SQLite WASM의 BLOB은 Node Buffer가 아닌 Uint8Array로 주고받는다.
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'blob',
})

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
 * - coverStatus: 표지 이미지 준비 완료(ready) 또는 대체 표지 사용(fallback).
 * - lastPage: 마지막 읽기 위치(1부터 시작). 저장된 위치가 없으면 NULL.
 * - analysisStatus: OCR·검색 인덱스 분석 중(analyzing), 완료(ready), 실패(failed).
 * - ocrCompletedAt: 전체 페이지 OCR 완료 시각. 미완료이면 NULL.
 * - indexedAt: 검색 인덱스 저장 완료 시각. 미완료이면 NULL.
 * - createdAt / updatedAt: 책 등록 시각 / 저장 정보 갱신 시각.
 * 시각은 모두 Unix epoch 기준 밀리초이며 앱에서 기록한다.
 */
export const books = sqliteTable(
  'books',
  {
    id: text('id'),
    contentHash: text('content_hash').notNull().unique(),
    fileName: text('file_name').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    pdfTitle: text('pdf_title'),
    pdfSubject: text('pdf_subject'),
    pdfKeywords: text('pdf_keywords'),
    publisher: text('publisher'),
    pdfSize: integer('pdf_size').notNull(),
    pageCount: integer('page_count').notNull(),
    coverData: bytes('cover_data'),
    coverMime: text('cover_mime'),
    coverStatus: text('cover_status', { enum: ['ready', 'fallback'] }).notNull(),
    lastPage: integer('last_page'),
    analysisStatus: text('analysis_status', { enum: ['analyzing', 'ready', 'failed'] }).notNull(),
    ocrCompletedAt: integer('ocr_completed_at'),
    indexedAt: integer('indexed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index('books_created_at_idx').on(sql`${table.createdAt} DESC`, sql`${table.id} DESC`),
    check('books_pdf_size_check', sql`${table.pdfSize} >= 0`),
    check('books_page_count_check', sql`${table.pageCount} > 0`),
    check('books_cover_status_check', sql`${table.coverStatus} IN ('ready', 'fallback')`),
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

/**
 * 책의 페이지별 OCR 진행 상태와 인식 이미지 크기.
 * - id: OCR 페이지 식별자.
 * - bookId: 이 페이지가 속한 책의 id.
 * - pageNumber: PDF 페이지 번호(1부터 시작).
 * - width / height: OCR에 사용한 이미지의 너비 / 높이(픽셀). 결과 저장 전에는 NULL.
 * - status: 대기(pending), 처리 중(processing), 완료(ready), 실패(failed).
 * - createdAt / updatedAt: OCR 작업 등록 시각 / 상태·결과 갱신 시각(Unix epoch 밀리초).
 */
export const ocrPages = sqliteTable(
  'ocr_pages',
  {
    id: text('id'),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    width: integer('width'),
    height: integer('height'),
    status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
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
export const ocrLines = sqliteTable(
  'ocr_lines',
  {
    id: integer('id'),
    ocrPageId: text('ocr_page_id')
      .notNull()
      .references(() => ocrPages.id, { onDelete: 'cascade' }),
    lineIndex: integer('line_index').notNull(),
    rawText: text('raw_text').notNull(),
    x0: real('x0').notNull(),
    y0: real('y0').notNull(),
    x1: real('x1').notNull(),
    y1: real('y1').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('ocr_lines_page_order_idx').on(table.ocrPageId, table.lineIndex),
    check('ocr_lines_x1_check', sql`${table.x1} > ${table.x0}`),
    check('ocr_lines_y1_check', sql`${table.y1} > ${table.y0}`),
  ],
)

/**
 * OCR 텍스트를 검색에 사용할 크기로 나눈 청크.
 * - id: 청크 식별자.
 * - bookId: 이 청크가 속한 책의 id.
 * - ordinal: 책 안에서의 청크 순서(0부터 시작).
 * - text: Kiwi 후처리를 거쳐 검색용으로 구성한 청크 본문.
 * - tokenCount: 공백으로 구분한 토큰 수. 청크 분할과 BM25 길이 보정에 사용한다.
 * - createdAt: 청크 저장 시각(Unix epoch 밀리초).
 */
export const searchChunks = sqliteTable(
  'search_chunks',
  {
    id: text('id'),
    bookId: text('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    tokenCount: integer('token_count').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('search_chunks_book_order_idx').on(table.bookId, table.ordinal),
    check('search_chunks_token_count_check', sql`${table.tokenCount} > 0`),
  ],
)

/**
 * 검색 청크와 원본 OCR 줄 범위를 연결한다. 한 청크에 여러 출처 범위가 있을 수 있다.
 * - id: SQLite가 자동 할당하는 출처 식별자.
 * - chunkId: 출처를 연결할 검색 청크의 id.
 * - ocrPageId: 원본 줄이 속한 OCR 페이지의 id.
 * - startLineIndex / endLineIndex: 원본 줄 범위의 시작 / 끝. 0부터 시작하며 양 끝을 포함한다.
 * - sourceOrder: 청크 안에서 출처 범위가 등장하는 순서(0부터 시작).
 */
export const chunkSources = sqliteTable(
  'chunk_sources',
  {
    id: integer('id'),
    chunkId: text('chunk_id')
      .notNull()
      .references(() => searchChunks.id, { onDelete: 'cascade' }),
    ocrPageId: text('ocr_page_id')
      .notNull()
      .references(() => ocrPages.id, { onDelete: 'cascade' }),
    startLineIndex: integer('start_line_index').notNull(),
    endLineIndex: integer('end_line_index').notNull(),
    sourceOrder: integer('source_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex('chunk_sources_chunk_order_idx').on(table.chunkId, table.sourceOrder),
    index('chunk_sources_page_line_idx').on(table.ocrPageId, table.startLineIndex),
    check('chunk_sources_line_range_check', sql`${table.endLineIndex} >= ${table.startLineIndex}`),
  ],
)

/**
 * 전체 책의 검색 인덱스에서 공유하는 검색어 사전.
 * - id: SQLite가 자동 할당하는 검색어 식별자.
 * - term: 인덱싱에 사용하는 중복 없는 검색어 문자열.
 * - documentFrequency: 이 검색어를 포함한 전체 청크 수. 책의 개수가 아니다.
 * 현재 책의 BM25 검색에서는 해당 책의 청크만 대상으로 빈도를 다시 계산한다.
 */
export const searchTerms = sqliteTable(
  'search_terms',
  {
    id: integer('id'),
    term: text('term').notNull().unique(),
    documentFrequency: integer('document_frequency').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    check('search_terms_document_frequency_check', sql`${table.documentFrequency} > 0`),
  ],
)

/**
 * 검색어가 등장하는 청크를 찾기 위한 역색인. 검색어와 청크 조합당 한 행을 저장한다.
 * - termId: 검색어 사전의 id.
 * - chunkId: 해당 검색어가 등장하는 청크의 id.
 * - termFrequency: 해당 청크 안에서 검색어가 등장한 횟수. BM25 점수 계산에 사용한다.
 */
export const searchPostings = sqliteTable(
  'search_postings',
  {
    termId: integer('term_id')
      .notNull()
      .references(() => searchTerms.id),
    chunkId: text('chunk_id')
      .notNull()
      .references(() => searchChunks.id, { onDelete: 'cascade' }),
    termFrequency: integer('term_frequency').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.termId, table.chunkId] }),
    index('search_postings_chunk_idx').on(table.chunkId),
    check('search_postings_term_frequency_check', sql`${table.termFrequency} > 0`),
  ],
)
