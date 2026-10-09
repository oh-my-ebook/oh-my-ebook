import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { describe, expect, it } from 'vitest'
import baselineSql from '../../../drizzle/0000_initial-schema.sql?raw'
import baselineSnapshot from '../../../drizzle/meta/0000_snapshot.json'
import { createTestDatabase } from '../../test/sqlocal'
import * as schema from './schema'
import { INITIAL_SCHEMA_SQL } from './schema-sql'

type Database = Awaited<ReturnType<typeof createTestDatabase>>

async function selectValue(database: Database, query: string) {
  const [row] = await database.sql(query)
  return row ? Object.values(row)[0] : undefined
}

async function createSeededDatabase(schemaSql: string) {
  const database = await createTestDatabase(schemaSql)
  await database.sql(`
    INSERT INTO books (
      id, content_hash, file_name, title, pdf_size, page_count,
      cover_status, analysis_status, created_at, updated_at
    ) VALUES ('book', 'hash', 'book.pdf', '책', 0, 2, 'fallback', 'analyzing', 1, 1);
    INSERT INTO ocr_pages (id, book_id, page_number, created_at, updated_at)
      VALUES ('page', 'book', 1, 1, 1);
    INSERT INTO ocr_lines (ocr_page_id, line_index, raw_text, x0, y0, x1, y1)
      VALUES ('page', 0, '문장', 0, 0, 10, 10);
    INSERT INTO search_chunks VALUES ('chunk', 'book', 0, '문장', 1, 1);
    INSERT INTO chunk_sources (
      chunk_id, ocr_page_id, start_line_index, end_line_index, source_order
    ) VALUES ('chunk', 'page', 0, 0, 0);
    INSERT INTO search_terms (term, document_frequency) VALUES ('문장', 1);
    INSERT INTO search_postings VALUES (1, 'chunk', 1);
  `)
  return database
}

describe('Drizzle 스키마', () => {
  it('스키마에서 생성한 SQL과 스냅샷이 저장된 초기 마이그레이션과 일치한다', async () => {
    const snapshot = await generateSQLiteDrizzleJson(schema)
    expect(snapshot.tables).toEqual(baselineSnapshot.tables)
    const statements = await generateSQLiteMigration(await generateSQLiteDrizzleJson({}), snapshot)
    expect(statements.map((statement) => statement.trim()).toSorted()).toEqual(
      baselineSql
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .toSorted(),
    )
  })

  it('기존 스키마의 컬럼, 기본 키, 인덱스 정렬과 외래 키를 유지한다', async () => {
    const readStructure = async (schemaSql: string) => {
      const database = await createTestDatabase(schemaSql)
      return {
        columns: await database.sql(`
          SELECT m.name AS table_name, p.name, p.type, p."notnull", p.dflt_value, p.pk
          FROM sqlite_schema m, pragma_table_info(m.name) p
          WHERE m.type = 'table' ORDER BY m.name, p.cid
        `),
        indexes: await database.sql(`
          SELECT m.name AS table_name,
            CASE WHEN i.name LIKE 'sqlite_autoindex_%'
              OR i.name IN ('books_content_hash_unique', 'search_terms_term_unique')
              THEN NULL ELSE i.name END AS name,
            i."unique", x.seqno, x.name AS column_name, x."desc", x.coll, i.partial
          FROM sqlite_schema m, pragma_index_list(m.name) i, pragma_index_xinfo(i.name) x
          WHERE m.type = 'table' AND x.key = 1
          ORDER BY m.name, name, column_name, x.seqno
        `),
        foreignKeys: await database.sql(`
          SELECT m.name AS table_name, f."table", f."from", f."to", f.on_update, f.on_delete, f.match
          FROM sqlite_schema m, pragma_foreign_key_list(m.name) f
          WHERE m.type = 'table' ORDER BY m.name, f."from"
        `),
      }
    }
    expect(await readStructure(baselineSql)).toEqual(await readStructure(INITIAL_SCHEMA_SQL))
  })

  it('표지 BLOB을 Uint8Array로 저장하고 복원한다', async () => {
    const database = await createSeededDatabase(baselineSql)
    const coverData = new Uint8Array([0, 128, 255])
    const driverValue = schema.books.coverData.mapToDriverValue(coverData)
    if (!(driverValue instanceof Uint8Array)) throw new Error('표지 바인딩 값이 아닙니다.')
    await database.sql('UPDATE books SET cover_data = ?', driverValue)
    const storedValue = await selectValue(database, 'SELECT cover_data FROM books')
    if (!(storedValue instanceof Uint8Array)) throw new Error('표지 BLOB이 아닙니다.')
    expect(schema.books.coverData.mapFromDriverValue(storedValue)).toEqual(coverData)
  })
})

describe.each([
  ['기존 SQL', INITIAL_SCHEMA_SQL],
  ['Drizzle 생성 SQL', baselineSql],
])('%s 스키마 계약', (_name, schemaSql) => {
  it('OCR 기본 상태, 선택 필드의 NULL과 정수 기본 키 자동 할당을 유지한다', async () => {
    const database = await createSeededDatabase(schemaSql)
    expect(await database.sql('SELECT status, width, height FROM ocr_pages')).toEqual([
      { status: 'pending', width: null, height: null },
    ])
    expect(await selectValue(database, 'SELECT last_page FROM books')).toBeNull()
    for (const table of ['ocr_lines', 'chunk_sources', 'search_terms']) {
      expect(await selectValue(database, `SELECT id FROM ${table}`)).toBe(1)
    }
    await database.sql(`
      INSERT INTO books (
        content_hash, file_name, title, pdf_size, page_count,
        cover_status, analysis_status, created_at, updated_at
      ) VALUES ('nullable-id', 'book.pdf', '책', 0, 1, 'fallback', 'analyzing', 1, 1)
    `)
    expect(
      await selectValue(database, "SELECT id FROM books WHERE content_hash = 'nullable-id'"),
    ).toBeNull()
  })

  it.each([
    ['PDF 크기', 'UPDATE books SET pdf_size = -1'],
    ['페이지 수', 'UPDATE books SET page_count = 0'],
    ['표지 상태', "UPDATE books SET cover_status = 'invalid'"],
    ['분석 상태', "UPDATE books SET analysis_status = 'invalid'"],
    ['읽기 위치 하한', 'UPDATE books SET last_page = 0'],
    ['읽기 위치 상한', 'UPDATE books SET last_page = 3'],
    ['OCR 페이지 번호', 'UPDATE ocr_pages SET page_number = 0'],
    ['OCR 너비', 'UPDATE ocr_pages SET width = 0'],
    ['OCR 높이', 'UPDATE ocr_pages SET height = 0'],
    ['OCR 상태', "UPDATE ocr_pages SET status = 'invalid'"],
    ['OCR 가로 좌표', 'UPDATE ocr_lines SET x1 = x0'],
    ['OCR 세로 좌표', 'UPDATE ocr_lines SET y1 = y0'],
    ['청크 토큰 수', 'UPDATE search_chunks SET token_count = 0'],
    ['출처 줄 범위', 'UPDATE chunk_sources SET end_line_index = -1'],
    ['검색어 문서 수', 'UPDATE search_terms SET document_frequency = 0'],
    ['검색어 출현 수', 'UPDATE search_postings SET term_frequency = 0'],
  ])('%s 제약 위반을 거부한다', async (_name, invalidSql) => {
    const database = await createSeededDatabase(schemaSql)
    await expect(database.sql(invalidSql)).rejects.toThrow(/CHECK constraint failed/)
  })

  it('책 삭제 시 OCR·검색 데이터를 함께 삭제하고 검색어는 남긴다', async () => {
    const database = await createSeededDatabase(schemaSql)
    await database.sql("DELETE FROM books WHERE id = 'book'")
    for (const table of [
      'books',
      'ocr_pages',
      'ocr_lines',
      'search_chunks',
      'chunk_sources',
      'search_postings',
    ]) {
      expect(await selectValue(database, `SELECT COUNT(*) FROM ${table}`)).toBe(0)
    }
    expect(await selectValue(database, 'SELECT COUNT(*) FROM search_terms')).toBe(1)
  })

  it('없는 책 참조와 사용 중인 검색어 삭제를 거부한다', async () => {
    const database = await createSeededDatabase(schemaSql)
    await expect(database.sql("UPDATE ocr_pages SET book_id = 'missing'")).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
    await expect(database.sql('DELETE FROM search_terms')).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    )
  })
})
