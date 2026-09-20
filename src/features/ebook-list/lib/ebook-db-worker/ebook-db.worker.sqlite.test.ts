import type { Database } from '@sqlite.org/sqlite-wasm'
import { describe, expect, it, vi } from 'vitest'
import { SQLITE_COMMAND } from '../../ebook-consts'
import { deleteBookById, executeSqliteCommand } from './ebook-db.worker.sqlite'

function createDatabase({
  incompletePages = 1,
  analysisStatus = 'analyzing',
  nextPage = null,
  ocrLinesForChunking = [],
  searchIndexChunkStoreFails = false,
  searchIndexStoreFails = false,
  searchResults = [],
  searchSources = [],
  searchTermCleanupFails = false,
  searchPostings = [],
  searchTerms = [],
  sourceBookId = 'book-id',
  storeFails = false,
}: {
  analysisStatus?: 'analyzing' | 'ready' | 'failed'
  incompletePages?: number
  nextPage?: Record<string, unknown> | null
  ocrLinesForChunking?: Record<string, unknown>[]
  searchIndexChunkStoreFails?: boolean
  searchIndexStoreFails?: boolean
  searchResults?: Record<string, unknown>[]
  searchSources?: Record<string, unknown>[]
  searchTermCleanupFails?: boolean
  searchPostings?: Record<string, unknown>[]
  searchTerms?: Record<string, unknown>[]
  sourceBookId?: string
  storeFails?: boolean
} = {}) {
  const exec = vi.fn((...args: unknown[]) => {
    const sql = args[0]
    if (
      storeFails &&
      typeof sql === 'string' &&
      sql.includes("SET width = ?, height = ?, status = 'ready'")
    ) {
      throw new Error('write failed')
    }
    if (
      searchIndexChunkStoreFails &&
      typeof sql === 'string' &&
      sql.includes('INSERT INTO search_chunks')
    ) {
      throw new Error('chunk write failed')
    }
    if (
      searchIndexStoreFails &&
      typeof sql === 'string' &&
      sql.includes('INSERT INTO search_postings')
    ) {
      throw new Error('posting write failed')
    }
    if (
      searchTermCleanupFails &&
      typeof sql === 'string' &&
      sql.includes('DELETE FROM search_terms')
    ) {
      throw new Error('term cleanup failed')
    }
    if (typeof sql === 'string' && sql.includes('term_document_frequencies')) return searchResults
    if (typeof sql === 'string' && sql.includes('WHERE chunk_sources.chunk_id IN')) {
      return searchSources
    }
    if (typeof sql === 'string' && sql.includes('FROM search_terms')) return searchTerms
    if (typeof sql === 'string' && sql.includes('FROM search_postings')) return searchPostings
    if (typeof sql === 'string' && sql.includes('ocr_page_id')) return ocrLinesForChunking
  })
  const selectValue = vi.fn((sql: string) => {
    if (sql === 'SELECT 1 FROM books WHERE id = ?') return 1
    if (sql.includes('SELECT page_count')) return 3
    if (sql === 'SELECT changes()') return 1
    if (sql.includes('SELECT id FROM search_terms')) return 1
    if (sql.includes('COUNT(')) return incompletePages
    return undefined
  })
  const selectObject = vi.fn((sql: string) => {
    if (sql === 'SELECT analysis_status FROM books WHERE id = ?') {
      return { analysis_status: analysisStatus }
    }
    if (sql.includes("status = 'pending'")) return nextPage
    if (sql.includes('SELECT book_id')) return { book_id: sourceBookId }
    return null
  })

  return {
    database: { exec, selectObject, selectValue } as unknown as Database,
    exec,
    selectObject,
  }
}

describe('OCR SQLite 계약', () => {
  it('BM25 순위를 유지하고 청크별 페이지 줄 출처를 포함한다', () => {
    const { database, exec } = createDatabase({
      searchResults: [
        {
          id: 'chunk-2',
          ordinal: 1,
          text: 'BM25 검색 청크',
          token_count: 4,
          score: 2.5,
        },
        {
          id: 'chunk-1',
          ordinal: 0,
          text: '다음 검색 청크',
          token_count: 3,
          score: 1.25,
        },
      ],
      searchSources: [
        {
          chunk_id: 'chunk-2',
          page_number: 4,
          start_line_index: 2,
          end_line_index: 5,
        },
        {
          chunk_id: 'chunk-2',
          page_number: 5,
          start_line_index: 0,
          end_line_index: 1,
        },
        {
          chunk_id: 'chunk-1',
          page_number: 2,
          start_line_index: 3,
          end_line_index: 4,
        },
      ],
    })

    expect(
      executeSqliteCommand(database, {
        requestId: 1,
        command: SQLITE_COMMAND.SEARCH_CHUNKS,
        payload: { bookId: 'book-id', terms: ['검색', '청크'], limit: 5 },
      }),
    ).toEqual([
      {
        id: 'chunk-2',
        ordinal: 1,
        text: 'BM25 검색 청크',
        tokenCount: 4,
        score: 2.5,
        sources: [
          { pageNumber: 4, startLineIndex: 2, endLineIndex: 5 },
          { pageNumber: 5, startLineIndex: 0, endLineIndex: 1 },
        ],
      },
      {
        id: 'chunk-1',
        ordinal: 0,
        text: '다음 검색 청크',
        tokenCount: 3,
        score: 1.25,
        sources: [{ pageNumber: 2, startLineIndex: 3, endLineIndex: 4 }],
      },
    ])
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('term_document_frequencies'), {
      bind: ['검색', '청크', 'book-id', 5],
      rowMode: 'object',
      returnValue: 'resultRows',
    })
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('WHERE chunk_sources.chunk_id IN'), {
      bind: ['chunk-2', 'chunk-1'],
      rowMode: 'object',
      returnValue: 'resultRows',
    })
  })

  it('검색어가 없거나 일치 청크가 없으면 빈 배열을 반환한다', () => {
    const { database, exec } = createDatabase()

    expect(
      executeSqliteCommand(database, {
        requestId: 2,
        command: SQLITE_COMMAND.SEARCH_CHUNKS,
        payload: { bookId: 'book-id', terms: [], limit: 5 },
      }),
    ).toEqual([])
    expect(
      executeSqliteCommand(database, {
        requestId: 3,
        command: SQLITE_COMMAND.SEARCH_CHUNKS,
        payload: { bookId: 'book-id', terms: ['없는검색어'], limit: 5 },
      }),
    ).toEqual([])
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('책 삭제 뒤 cascade된 posting을 기준으로 고아 term을 제거하고 남은 DF를 갱신한다', () => {
    const { database, exec } = createDatabase()

    deleteBookById(database, 'book-id')

    expect(exec.mock.calls.map(([sql]) => String(sql))).toEqual([
      'BEGIN IMMEDIATE',
      'DELETE FROM books WHERE id = ?',
      expect.stringContaining('DELETE FROM search_terms'),
      expect.stringContaining('SET document_frequency = ('),
      'COMMIT',
    ])
    expect(exec).toHaveBeenCalledWith('DELETE FROM books WHERE id = ?', { bind: ['book-id'] })
  })

  it('책 삭제 뒤 term 정리에 실패하면 책 삭제도 롤백한다', () => {
    const { database, exec } = createDatabase({ searchTermCleanupFails: true })

    expect(() => deleteBookById(database, 'book-id')).toThrow('term cleanup failed')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
  })

  it('페이지 행을 중복 없이 pending으로 만든다', () => {
    const { database, exec } = createDatabase()

    executeSqliteCommand(database, {
      requestId: 1,
      command: SQLITE_COMMAND.INITIALIZE_OCR_PAGES,
      payload: { bookId: 'book-id', pageCount: 3 },
    })

    const inserts = exec.mock.calls.filter(([sql]) => String(sql).includes('INSERT OR IGNORE'))
    expect(inserts).toHaveLength(3)
    expect(
      inserts.map(([, options]) => (options as unknown as { bind: unknown[] }).bind[2]),
    ).toEqual([1, 2, 3])
  })

  it('중단되었거나 실패한 페이지를 다음 실행을 위해 pending으로 되돌린다', () => {
    const { database, exec } = createDatabase()

    executeSqliteCommand(database, {
      requestId: 2,
      command: SQLITE_COMMAND.PREPARE_OCR_PAGES_FOR_RUN,
      payload: 'book-id',
    })

    expect(exec).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"), {
      bind: [expect.any(Number), 'book-id'],
    })
    expect(exec).toHaveBeenCalledWith(expect.stringContaining("('processing', 'failed')"), {
      bind: [expect.any(Number), 'book-id'],
    })
  })

  it('실패한 책 분석을 재시도 가능한 상태로 되돌린다', () => {
    const { database, exec } = createDatabase()

    executeSqliteCommand(database, {
      requestId: 21,
      command: SQLITE_COMMAND.RETRY_BOOK_ANALYSIS,
      payload: 'book-id',
    })

    expect(exec).toHaveBeenCalledWith(expect.stringContaining("analysis_status = 'analyzing'"), {
      bind: [expect.any(Number), 'book-id'],
    })
  })

  it('책의 분석 상태를 조회한다', () => {
    const { database, selectObject } = createDatabase({ analysisStatus: 'failed' })

    const result = executeSqliteCommand(database, {
      requestId: 22,
      command: SQLITE_COMMAND.GET_BOOK_ANALYSIS_STATUS,
      payload: 'book-id',
    })

    expect(result).toBe('failed')
    expect(selectObject).toHaveBeenCalledWith('SELECT analysis_status FROM books WHERE id = ?', [
      'book-id',
    ])
  })

  it('pending 중 가장 앞 페이지를 선점한다', () => {
    const { database, exec, selectObject } = createDatabase({
      nextPage: { id: 'page-2', page_number: 2 },
    })

    const page = executeSqliteCommand(database, {
      requestId: 3,
      command: SQLITE_COMMAND.ACQUIRE_NEXT_OCR_PAGE,
      payload: 'book-id',
    })

    expect(page).toEqual({ id: 'page-2', pageNumber: 2 })
    expect(selectObject).toHaveBeenCalledWith(expect.stringContaining('ORDER BY page_number'), [
      'book-id',
    ])
    expect(selectObject).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"), [
      'book-id',
    ])
    expect(exec.mock.calls[1]?.[0]).toContain("SET status = 'processing'")
  })

  it('한 페이지의 원문과 좌표를 저장하고 마지막 페이지에서만 OCR 완료 시각을 기록한다', () => {
    const { database, exec } = createDatabase({ incompletePages: 0 })

    const completed = executeSqliteCommand(database, {
      requestId: 3,
      command: SQLITE_COMMAND.STORE_OCR_PAGE,
      payload: {
        pageId: 'page-1',
        width: 100,
        height: 200,
        lines: [{ rawText: '원문', x0: 1, y0: 2, x1: 3, y1: 4 }],
      },
    })

    expect(completed).toBe(true)
    expect(exec.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DELETE FROM ocr_lines'),
        expect.stringContaining('INSERT INTO ocr_lines'),
        expect.stringContaining("SET width = ?, height = ?, status = 'ready'"),
        expect.stringContaining('SET ocr_completed_at = ?'),
      ]),
    )
  })

  it('페이지 저장 중 오류가 나면 모든 변경을 롤백한다', () => {
    const { database, exec } = createDatabase({ storeFails: true })

    expect(() =>
      executeSqliteCommand(database, {
        requestId: 4,
        command: SQLITE_COMMAND.STORE_OCR_PAGE,
        payload: { pageId: 'page-1', width: 100, height: 200, lines: [] },
      }),
    ).toThrow('write failed')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
  })

  it('청킹할 OCR 줄을 페이지와 줄 순서로 조회한다', () => {
    const lines = [
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '첫 줄' },
      { ocr_page_id: 'page-2', page_number: 2, line_index: 0, raw_text: '둘째 페이지' },
    ]
    const { database, exec } = createDatabase({ ocrLinesForChunking: lines })

    const result = executeSqliteCommand(database, {
      requestId: 5,
      command: 'getOcrLinesForChunking',
      payload: 'book-id',
    })

    expect(result).toEqual(lines)
    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY ocr_pages.page_number, ocr_lines.line_index'),
      expect.objectContaining({ bind: ['book-id'] }),
    )
  })

  it('책에 속한 term과 posting을 페이지 단위로 조회한다', () => {
    const { database } = createDatabase({
      searchTerms: [{ id: 1, term: '검색', document_frequency: 2 }],
      searchPostings: [
        {
          term_id: 1,
          chunk_id: 'chunk-1',
          term_frequency: 2,
          term: '검색',
          chunk_ordinal: 0,
        },
      ],
    })

    expect(
      executeSqliteCommand(database, {
        requestId: 63,
        command: 'listSearchTerms',
        payload: { bookId: 'book-id', limit: 50, offset: 0 },
      }),
    ).toEqual({ total: 1, terms: [{ id: 1, term: '검색', document_frequency: 2 }] })
    expect(
      executeSqliteCommand(database, {
        requestId: 64,
        command: 'listSearchPostings',
        payload: { bookId: 'book-id', limit: 50, offset: 0 },
      }),
    ).toEqual({
      total: 1,
      postings: [
        {
          term_id: 1,
          chunk_id: 'chunk-1',
          term_frequency: 2,
          term: '검색',
          chunk_ordinal: 0,
        },
      ],
    })
  })

  it('청크·원본 범위·term·posting·완료 상태를 하나의 트랜잭션으로 교체한다', () => {
    const { database, exec } = createDatabase()

    executeSqliteCommand(database, {
      requestId: 61,
      command: 'storeSearchIndex',
      payload: {
        bookId: 'book-id',
        chunks: [
          {
            id: 'chunk-1',
            ordinal: 0,
            text: '전자책 검색',
            tokenCount: 2,
            sources: [
              {
                ocrPageId: 'page-1',
                startLineIndex: 0,
                endLineIndex: 1,
                sourceOrder: 0,
              },
            ],
            terms: [{ term: '검색', termFrequency: 2 }],
          },
        ],
      },
    })

    expect(exec.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        'BEGIN IMMEDIATE',
        expect.stringContaining('DELETE FROM search_chunks WHERE book_id = ?'),
        expect.stringContaining('DELETE FROM search_terms'),
        expect.stringContaining('SET document_frequency = ('),
        expect.stringContaining('INSERT INTO search_chunks'),
        expect.stringContaining('INSERT INTO chunk_sources'),
        expect.stringContaining('INSERT INTO search_terms'),
        expect.stringContaining('INSERT INTO search_postings'),
        expect.stringContaining("analysis_status = 'ready'"),
        'COMMIT',
      ]),
    )
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO search_postings'), {
      bind: [1, 'chunk-1', 2],
    })
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chunk_sources'), {
      bind: ['chunk-1', 'page-1', 0, 1, 0],
    })
  })

  it('posting 저장에 실패하면 청크와 분석 완료 갱신을 모두 롤백한다', () => {
    const { database, exec } = createDatabase({ searchIndexStoreFails: true })

    expect(() =>
      executeSqliteCommand(database, {
        requestId: 62,
        command: 'storeSearchIndex',
        payload: {
          bookId: 'book-id',
          chunks: [
            {
              id: 'chunk-1',
              ordinal: 0,
              text: '전자책 검색',
              tokenCount: 2,
              sources: [],
              terms: [{ term: '검색', termFrequency: 1 }],
            },
          ],
        },
      }),
    ).toThrow('posting write failed')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
    expect(exec).not.toHaveBeenCalledWith(expect.stringContaining("analysis_status = 'ready'"), {
      bind: expect.anything(),
    })
  })

  it('청크 저장 중 오류가 나면 기존 청크 삭제를 포함해 롤백한다', () => {
    const { database, exec } = createDatabase({ searchIndexChunkStoreFails: true })

    expect(() =>
      executeSqliteCommand(database, {
        requestId: 7,
        command: SQLITE_COMMAND.STORE_SEARCH_INDEX,
        payload: {
          bookId: 'book-id',
          chunks: [
            {
              id: 'chunk-1',
              ordinal: 0,
              text: '검색 청크',
              tokenCount: 2,
              sources: [],
              terms: [],
            },
          ],
        },
      }),
    ).toThrow('chunk write failed')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
  })

  it('다른 책의 OCR 페이지를 청크 원본으로 저장하지 않는다', () => {
    const { database, exec } = createDatabase({ sourceBookId: 'other-book-id' })

    expect(() =>
      executeSqliteCommand(database, {
        requestId: 8,
        command: SQLITE_COMMAND.STORE_SEARCH_INDEX,
        payload: {
          bookId: 'book-id',
          chunks: [
            {
              id: 'chunk-1',
              ordinal: 0,
              text: '검색 청크',
              tokenCount: 2,
              sources: [
                {
                  ocrPageId: 'page-1',
                  startLineIndex: 0,
                  endLineIndex: 0,
                  sourceOrder: 0,
                },
              ],
              terms: [],
            },
          ],
        },
      }),
    ).toThrow('Chunk source does not belong to book')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
  })
})
