import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { describe, expect, it } from 'vitest'
import { createSearchChunksSql } from './ebook-db.worker.sql'

function isScoredRow(value: unknown): value is { id: string; score: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'score' in value &&
    typeof value.score === 'number'
  )
}

function readScoredRows(value: unknown): { id: string; score: number }[] {
  if (!Array.isArray(value) || !value.every(isScoredRow)) {
    throw new Error('BM25 검색 결과가 올바르지 않습니다.')
  }
  return value
}

describe('현재 책 BM25 검색 SQL', () => {
  it('현재 책의 문서 통계와 검색어별 DF로 청크 점수를 계산한다', () => {
    const sql = createSearchChunksSql(2)

    expect(sql).toContain('query_terms(term) AS (VALUES (?), (?))')
    expect(sql).toContain('FROM search_chunks WHERE book_id = ?')
    expect(sql).toContain('COUNT(*) AS document_count')
    expect(sql).toContain('AVG(token_count) AS average_document_length')
    expect(sql).toContain('COUNT(*) AS document_frequency')
    expect(sql).toContain('search_postings.term_frequency')
    expect(sql).toContain('1.2')
    expect(sql).toContain('0.75')
    expect(sql).toContain('ORDER BY score DESC, ordinal ASC')
    expect(sql).toContain('LIMIT ?')
  })

  it.each([0, -1, 1.5])('검색어 수가 양의 정수가 아니면 거부한다', (termCount) => {
    expect(() => createSearchChunksSql(termCount)).toThrow(RangeError)
  })

  it('실제 SQLite에서 현재 책만 검색하고 여러 검색어 점수를 합산해 정렬한다', async () => {
    const sqlite3 = await sqlite3InitModule()
    const database = new sqlite3.oo1.DB(':memory:', 'c')
    database.exec(`
      CREATE TABLE search_chunks (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL
      );
      CREATE TABLE search_terms (id INTEGER PRIMARY KEY, term TEXT NOT NULL UNIQUE);
      CREATE TABLE search_postings (
        term_id INTEGER NOT NULL,
        chunk_id TEXT NOT NULL,
        term_frequency INTEGER NOT NULL
      );
      INSERT INTO search_chunks VALUES
        ('a-1', 'book-a', 0, '알파와 베타', 100),
        ('a-2', 'book-a', 1, '알파', 100),
        ('a-3', 'book-a', 2, '베타', 100),
        ('b-1', 'book-b', 0, '다른 책의 알파', 1);
      INSERT INTO search_terms VALUES (1, 'alpha'), (2, 'beta');
      INSERT INTO search_postings VALUES
        (1, 'a-1', 3), (2, 'a-1', 1), (1, 'a-2', 1), (2, 'a-3', 1),
        (1, 'b-1', 100);
    `)

    try {
      const alphaRows = readScoredRows(
        database.exec(createSearchChunksSql(1), {
          bind: ['alpha', 'book-a', 5],
          rowMode: 'object',
          returnValue: 'resultRows',
        }),
      )
      const combinedRows = readScoredRows(
        database.exec(createSearchChunksSql(2), {
          bind: ['alpha', 'beta', 'book-a', 5],
          rowMode: 'object',
          returnValue: 'resultRows',
        }),
      )

      expect(alphaRows.map(({ id }) => id)).toEqual(['a-1', 'a-2'])
      expect(combinedRows.map(({ id }) => id)).toEqual(['a-1', 'a-2', 'a-3'])
      expect(combinedRows[0]?.score).toBeGreaterThan(alphaRows[0]?.score ?? 0)
      expect(combinedRows.some(({ id }) => id === 'b-1')).toBe(false)
    } finally {
      database.close()
    }
  })
})
