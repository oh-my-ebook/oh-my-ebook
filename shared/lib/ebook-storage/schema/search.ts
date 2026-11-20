import { getColumns, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  snakeCase,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { booksTable } from './book'
import { timestamps } from './common'
import { ocrPagesTable } from './ocr'

export const searchChunkColumns = {
  id: text().primaryKey().notNull(),
  ordinal: integer().notNull(),
  text: text().notNull(),
  tokenCount: integer().notNull(),
}

export const chunkSourceColumns = {
  ocrPageId: text()
    .notNull()
    .references(() => ocrPagesTable.id, { onDelete: 'cascade' }),
  startLineIndex: integer().notNull(),
  endLineIndex: integer().notNull(),
  sourceOrder: integer().notNull(),
}

/**
 * OCR 텍스트를 검색에 사용할 크기로 나눈 청크.
 * - id: 청크 식별자.
 * - bookId: 이 청크가 속한 책의 id.
 * - ordinal: 책 안에서의 청크 순서(0부터 시작).
 * - text: Kiwi 후처리를 거쳐 검색용으로 구성한 청크 본문.
 * - tokenCount: 공백으로 구분한 토큰 수. 청크 분할과 BM25 길이 보정에 사용한다.
 * - createdAt: 청크 저장 시각(Unix epoch 밀리초).
 */
export const searchChunksTable = snakeCase.table(
  'search_chunks',
  {
    ...searchChunkColumns,
    bookId: text()
      .notNull()
      .references(() => booksTable.id, { onDelete: 'cascade' }),
    createdAt: timestamps.createdAt,
  },
  (table) => [
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
export const chunkSourcesTable = snakeCase.table(
  'chunk_sources',
  {
    id: integer().primaryKey(),
    chunkId: text()
      .notNull()
      .references(() => searchChunksTable.id, { onDelete: 'cascade' }),
    ...chunkSourceColumns,
  },
  (table) => [
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
export const searchTermsTable = snakeCase.table(
  'search_terms',
  {
    id: integer().primaryKey(),
    term: text().notNull().unique(),
    documentFrequency: integer().notNull(),
  },
  (table) => [check('search_terms_document_frequency_check', sql`${table.documentFrequency} > 0`)],
)

/**
 * 검색어가 등장하는 청크를 찾기 위한 역색인. 검색어와 청크 조합당 한 행을 저장한다.
 * - termId: 검색어 사전의 id.
 * - chunkId: 해당 검색어가 등장하는 청크의 id.
 * - termFrequency: 해당 청크 안에서 검색어가 등장한 횟수. BM25 점수 계산에 사용한다.
 */
export const searchPostingsTable = snakeCase.table(
  'search_postings',
  {
    termId: integer()
      .notNull()
      .references(() => searchTermsTable.id),
    chunkId: text()
      .notNull()
      .references(() => searchChunksTable.id, { onDelete: 'cascade' }),
    termFrequency: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.termId, table.chunkId] }),
    index('search_postings_chunk_idx').on(table.chunkId),
    check('search_postings_term_frequency_check', sql`${table.termFrequency} > 0`),
  ],
)

export const searchTermFrequencyColumns = {
  term: searchTermsTable.term,
  termFrequency: searchPostingsTable.termFrequency,
}

export const searchPostingRecordColumns = {
  ...getColumns(searchPostingsTable),
  ...searchTermFrequencyColumns,
  chunkOrdinal: searchChunksTable.ordinal,
}

export const chunkSourceRecordColumns = {
  ...getColumns(chunkSourcesTable),
  chunkOrdinal: searchChunksTable.ordinal,
  pageNumber: ocrPagesTable.pageNumber,
}

export const searchChunkSourceColumns = {
  pageNumber: ocrPagesTable.pageNumber,
  startLineIndex: chunkSourcesTable.startLineIndex,
  endLineIndex: chunkSourcesTable.endLineIndex,
}
