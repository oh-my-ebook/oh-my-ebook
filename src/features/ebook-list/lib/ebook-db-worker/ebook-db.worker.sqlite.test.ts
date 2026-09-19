import type { Database } from '@sqlite.org/sqlite-wasm'
import { describe, expect, it, vi } from 'vitest'
import { SQLITE_COMMAND } from '../../ebook-consts'
import { executeSqliteCommand } from './ebook-db.worker.sqlite'

function createDatabase({
  incompletePages = 1,
  nextPage = null,
  storeFails = false,
}: {
  incompletePages?: number
  nextPage?: Record<string, unknown> | null
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
  })
  const selectValue = vi.fn((sql: string) => {
    if (sql.includes('SELECT page_count')) return 3
    if (sql === 'SELECT changes()') return 1
    if (sql.includes('COUNT(*)')) return incompletePages
    return undefined
  })
  const selectObject = vi.fn((sql: string) => {
    if (sql.includes("status = 'pending'")) return nextPage
    if (sql.includes('SELECT book_id')) return { book_id: 'book-id' }
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
})
