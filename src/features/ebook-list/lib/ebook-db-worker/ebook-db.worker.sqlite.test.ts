import type { Database } from '@sqlite.org/sqlite-wasm'
import { describe, expect, it, vi } from 'vitest'
import { SQLITE_COMMAND } from '../../ebook-consts'
import { executeSqliteCommand } from './ebook-db.worker.sqlite'

function createDatabase({
  incompletePages = 1,
  nextPage = null,
  ocrLinesForChunking = [],
  searchChunkStoreFails = false,
  sourceBookId = 'book-id',
  storeFails = false,
}: {
  incompletePages?: number
  nextPage?: Record<string, unknown> | null
  ocrLinesForChunking?: Record<string, unknown>[]
  searchChunkStoreFails?: boolean
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
      searchChunkStoreFails &&
      typeof sql === 'string' &&
      sql.includes('INSERT INTO search_chunks')
    ) {
      throw new Error('chunk write failed')
    }
    if (typeof sql === 'string' && sql.includes('ocr_page_id')) return ocrLinesForChunking
  })
  const selectValue = vi.fn((sql: string) => {
    if (sql === 'SELECT 1 FROM books WHERE id = ?') return 1
    if (sql.includes('SELECT page_count')) return 3
    if (sql === 'SELECT changes()') return 1
    if (sql.includes('COUNT(*)')) return incompletePages
    return undefined
  })
  const selectObject = vi.fn((sql: string) => {
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

  it('기존 청크를 지우고 청크와 원본 범위를 하나의 트랜잭션으로 저장한다', () => {
    const { database, exec } = createDatabase()

    executeSqliteCommand(database, {
      requestId: 6,
      command: SQLITE_COMMAND.STORE_SEARCH_CHUNKS,
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
                endLineIndex: 1,
                sourceOrder: 0,
              },
            ],
          },
        ],
      },
    })

    expect(exec.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining([
        'BEGIN IMMEDIATE',
        expect.stringContaining('DELETE FROM search_chunks WHERE book_id = ?'),
        expect.stringContaining('INSERT INTO search_chunks'),
        expect.stringContaining('INSERT INTO chunk_sources'),
        'COMMIT',
      ]),
    )
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM search_chunks'), {
      bind: ['book-id'],
    })
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO search_chunks'), {
      bind: ['chunk-1', 'book-id', 0, '검색 청크', 2, expect.any(Number)],
    })
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chunk_sources'), {
      bind: ['chunk-1', 'page-1', 0, 1, 0],
    })
  })

  it('청크 저장 중 오류가 나면 기존 청크 삭제를 포함해 롤백한다', () => {
    const { database, exec } = createDatabase({ searchChunkStoreFails: true })

    expect(() =>
      executeSqliteCommand(database, {
        requestId: 7,
        command: SQLITE_COMMAND.STORE_SEARCH_CHUNKS,
        payload: {
          bookId: 'book-id',
          chunks: [
            {
              id: 'chunk-1',
              ordinal: 0,
              text: '검색 청크',
              tokenCount: 2,
              sources: [],
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
        command: SQLITE_COMMAND.STORE_SEARCH_CHUNKS,
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
            },
          ],
        },
      }),
    ).toThrow('Chunk source does not belong to book')

    expect(exec).toHaveBeenLastCalledWith('ROLLBACK')
  })
})
