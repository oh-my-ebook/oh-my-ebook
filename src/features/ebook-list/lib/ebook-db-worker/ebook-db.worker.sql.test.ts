import { describe, expect, it } from 'vitest'
import { createSearchChunksSql } from './ebook-db.worker.sql'

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
})
