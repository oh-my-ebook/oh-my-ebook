import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deletePdf,
  executeOpfsCommand,
  hasPdf,
  isOpfsCommand,
  readPdf,
  writePdf,
} from './ebook-db.worker.opfs'

vi.mock('@sqlite.org/sqlite-wasm', () => ({ default: vi.fn() }))
vi.mock('./ebook-db.worker.opfs', () => ({
  executeOpfsCommand: vi.fn(),
  isOpfsCommand: vi.fn((command: string) => ['writePdf', 'readPdf', 'deletePdf'].includes(command)),
  deletePdf: vi.fn(),
  hasPdf: vi.fn(),
  readPdf: vi.fn(),
  writePdf: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('ebook-db.worker', () => {
  it('OPFS PDF 저장·조회·삭제 명령을 처리한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)
    const contentHash = 'a'.repeat(64)
    const pdfData = new Uint8Array([1, 2, 3]).buffer
    vi.mocked(executeOpfsCommand)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
      .mockResolvedValueOnce(undefined)

    class Database {
      exec(sql: string) {
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 1, command: 'writePdf', payload: { contentHash, pdfData } },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: { requestId: 2, command: 'readPdf', payload: contentHash },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: { requestId: 3, command: 'deletePdf', payload: contentHash },
      }),
    )

    expect(isOpfsCommand).toHaveBeenCalledWith('writePdf')
    expect(executeOpfsCommand).toHaveBeenNthCalledWith(1, {
      requestId: 1,
      command: 'writePdf',
      payload: { contentHash, pdfData },
    })
    expect(executeOpfsCommand).toHaveBeenNthCalledWith(2, {
      requestId: 2,
      command: 'readPdf',
      payload: contentHash,
    })
    expect(executeOpfsCommand).toHaveBeenNthCalledWith(3, {
      requestId: 3,
      command: 'deletePdf',
      payload: contentHash,
    })
    expect(responses).toHaveBeenNthCalledWith(1, { requestId: 1, result: null })
    expect(responses).toHaveBeenNthCalledWith(2, {
      requestId: 2,
      result: new Uint8Array([1, 2, 3]),
    })
    expect(responses).toHaveBeenNthCalledWith(3, { requestId: 3, result: null })
  })

  it('알 수 없는 명령은 SQLite를 열지 않고 실패로 응답한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('self', workerScope)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(new MessageEvent('message', { data: { requestId: 4, command: 'unknown' } }))

    expect(sqlite3InitModule).not.toHaveBeenCalled()
    expect(responses).toHaveBeenCalledWith({ requestId: 4, error: { code: 'storage-failed' } })
    expect(consoleError).toHaveBeenCalledWith(
      'ebook-db.worker command failed',
      expect.objectContaining({ command: 'unknown', error: expect.any(Error) }),
    )
  })

  it('새 DB는 PDF BLOB 없이 페이지 OCR 저장 스키마를 만든다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [0]
        return this
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(new MessageEvent('message', { data: { requestId: 6, command: 'initialize' } }))

    const schema = statements.find((statement) => statement.includes('CREATE TABLE books'))
    expect(schema).toContain('author TEXT')
    expect(schema).toContain('pdf_title TEXT')
    expect(schema).toContain('pdf_subject TEXT')
    expect(schema).toContain('pdf_keywords TEXT')
    expect(schema).toContain('publisher TEXT')
    expect(schema).toContain('pdf_size INTEGER NOT NULL CHECK (pdf_size >= 0)')
    expect(schema).toContain(
      "analysis_status TEXT NOT NULL CHECK (analysis_status IN ('analyzing', 'ready', 'failed'))",
    )
    expect(schema).toContain('ocr_completed_at INTEGER')
    expect(schema).toContain('indexed_at INTEGER')
    expect(schema).not.toContain('pdf_data BLOB')
    expect(schema).toContain('CREATE TABLE ocr_pages')
    expect(schema).toContain('book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE')
    expect(schema).toContain('page_number INTEGER NOT NULL CHECK (page_number > 0)')
    expect(schema).toContain('width INTEGER CHECK (width IS NULL OR width > 0)')
    expect(schema).toContain('height INTEGER CHECK (height IS NULL OR height > 0)')
    expect(schema).toContain("status TEXT NOT NULL DEFAULT 'pending'")
    expect(schema).toContain("CHECK (status IN ('pending', 'processing', 'ready', 'failed'))")
    expect(schema).toContain('CREATE TABLE ocr_lines')
    expect(schema).toContain('ocr_page_id TEXT NOT NULL REFERENCES ocr_pages(id) ON DELETE CASCADE')
    expect(schema).toContain('line_index INTEGER NOT NULL')
    expect(schema).toContain('x1 REAL NOT NULL CHECK (x1 > x0)')
    expect(schema).toContain('y1 REAL NOT NULL CHECK (y1 > y0)')
    expect(schema).toContain('CREATE UNIQUE INDEX ocr_pages_book_page_idx')
    expect(schema).toContain('CREATE INDEX ocr_pages_resume_idx')
    expect(schema).toContain('CREATE UNIQUE INDEX ocr_lines_page_order_idx')
    expect(statements).toContain('PRAGMA foreign_keys = ON')
    expect(schema).toContain('PRAGMA user_version = 1')
    expect(responses).toHaveBeenCalledWith({ requestId: 6, result: null })
  })

  it('SQLite 책 목록에 OPFS 원본 유무를 표시한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)
    vi.mocked(hasPdf).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        if (sql.includes('FROM books ORDER BY')) {
          return [
            {
              id: 'available-book',
              content_hash: 'a'.repeat(64),
              title: '읽을 수 있는 책',
              analysis_status: 'analyzing',
              ocr_completed_at: null,
              indexed_at: null,
            },
            {
              id: 'missing-book',
              content_hash: 'b'.repeat(64),
              title: '원본이 없는 책',
              analysis_status: 'ready',
              ocr_completed_at: 1,
              indexed_at: 2,
            },
          ]
        }
        return this
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(new MessageEvent('message', { data: { requestId: 20, command: 'listBooks' } }))

    expect(hasPdf).toHaveBeenNthCalledWith(1, 'a'.repeat(64))
    expect(hasPdf).toHaveBeenNthCalledWith(2, 'b'.repeat(64))
    expect(statements.find((statement) => statement.includes('FROM books ORDER BY'))).toContain(
      'analysis_status, ocr_completed_at, indexed_at',
    )
    expect(responses).toHaveBeenCalledWith({
      requestId: 20,
      result: [
        expect.objectContaining({
          id: 'available-book',
          pdf_status: 'available',
          analysis_status: 'analyzing',
          ocr_completed_at: null,
          indexed_at: null,
        }),
        expect.objectContaining({
          id: 'missing-book',
          pdf_status: 'missing',
          analysis_status: 'ready',
          ocr_completed_at: 1,
          indexed_at: 2,
        }),
      ],
    })
  })

  it('삽입 중 오류가 나면 트랜잭션을 롤백하고 실패를 응답한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class FailingDatabase {
      exec(sql: string) {
        statements.push(sql.trim().split(/\s+/)[0])
        if (sql === 'PRAGMA user_version') return [1]
        if (sql.includes('INSERT INTO books')) throw new Error('disk failure')
        return this
      }
      selectValue(sql: string) {
        return sql === 'SELECT changes()' ? 1 : undefined
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: FailingDatabase },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 7,
          command: 'saveBook',
          payload: {
            pdfData: new ArrayBuffer(2),
            contentHash: 'a'.repeat(64),
            fileName: 'a.pdf',
            title: 'A',
            author: '저자',
            pdfTitle: '원본 제목',
            pdfSubject: '주제',
            pdfKeywords: '키워드',
            publisher: '출판사',
            pdfSize: 2,
            pageCount: 1,
            coverData: null,
            coverMime: null,
            coverStatus: 'fallback',
          },
        },
      }),
    )

    expect(statements).toContain('BEGIN')
    expect(statements).toContain('ROLLBACK')
    expect(statements).not.toContain('COMMIT')
    expect(responses).toHaveBeenCalledWith({ requestId: 7, error: { code: 'storage-failed' } })
  })

  it('PDF BLOB 없이 분석 메타데이터를 저장한다', async () => {
    const calls: Array<{ sql: string; bind?: unknown[] }> = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string, options?: { bind?: unknown[] }) {
        calls.push({ sql, bind: options?.bind })
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectValue() {
        return undefined
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 18,
          command: 'saveBook',
          payload: {
            pdfData: new ArrayBuffer(123),
            contentHash: 'a'.repeat(64),
            fileName: 'book.pdf',
            title: '서재 제목',
            author: '저자',
            pdfTitle: 'PDF 제목',
            pdfSubject: null,
            pdfKeywords: 'pdf, metadata',
            publisher: '출판사',
            pdfSize: 123,
            pageCount: 1,
            coverData: null,
            coverMime: null,
            coverStatus: 'fallback',
          },
        },
      }),
    )

    const insert = calls.find((call) => call.sql.includes('INSERT INTO books'))
    expect(insert?.sql).not.toContain('pdf_data')
    expect(insert?.bind).toEqual(
      expect.arrayContaining(['저자', 'PDF 제목', null, 'pdf, metadata', '출판사', 123]),
    )
    expect(insert?.bind).toEqual(expect.arrayContaining(['analyzing', null, null]))
    expect(writePdf).toHaveBeenCalledWith('a'.repeat(64), expect.any(ArrayBuffer))
    expect(responses).toHaveBeenCalledWith({ requestId: 18, result: expect.any(String) })
  })

  it('OPFS 저장 실패 시 방금 만든 SQLite 메타데이터를 삭제한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)
    vi.mocked(writePdf).mockRejectedValueOnce(new Error('write failed'))

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectValue(sql: string) {
        return sql === 'SELECT changes()' ? 1 : undefined
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 19,
          command: 'saveBook',
          payload: {
            pdfData: new ArrayBuffer(1),
            contentHash: 'a'.repeat(64),
            fileName: 'book.pdf',
            title: '서재 제목',
            author: null,
            pdfTitle: null,
            pdfSubject: null,
            pdfKeywords: null,
            publisher: null,
            pdfSize: 1,
            pageCount: 1,
            coverData: null,
            coverMime: null,
            coverStatus: 'fallback',
          },
        },
      }),
    )

    expect(writePdf).toHaveBeenCalledOnce()
    expect(statements.some((statement) => statement.includes('INSERT INTO books'))).toBe(true)
    expect(statements).toContain('DELETE FROM books WHERE id = ?')
    expect(responses).toHaveBeenCalledWith({ requestId: 19, error: { code: 'storage-failed' } })
  })

  it('지원하는 명령의 잘못된 payload는 명령별 원인을 기록한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 8, command: 'saveBook', payload: { title: '불완전한 입력' } },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: { requestId: 9, command: 'getBook', payload: '' },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 10,
          command: 'updateCover',
          payload: { id: '', coverData: new ArrayBuffer(1), coverMime: 'image/png' },
        },
      }),
    )

    expect(responses).toHaveBeenCalledWith({ requestId: 8, error: { code: 'storage-failed' } })
    expect(consoleError).toHaveBeenCalledWith(
      'ebook-db.worker command failed',
      expect.objectContaining({ command: 'saveBook', error: expect.any(Error) }),
    )
    expect(consoleError.mock.calls[0][1]).toMatchObject({
      error: expect.objectContaining({ message: 'Invalid payload for saveBook' }),
    })
    expect(consoleError.mock.calls.slice(1)).toEqual([
      [
        'ebook-db.worker command failed',
        expect.objectContaining({
          command: 'getBook',
          error: expect.objectContaining({ message: 'Invalid payload for getBook' }),
        }),
      ],
      [
        'ebook-db.worker command failed',
        expect.objectContaining({
          command: 'updateCover',
          error: expect.objectContaining({ message: 'Invalid payload for updateCover' }),
        }),
      ],
    ])
  })

  it('음수 PDF 크기와 공백 콘텐츠 해시는 저장하지 않고 잘못된 payload로 처리한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')

    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 16,
          command: 'saveBook',
          payload: {
            pdfData: new ArrayBuffer(0),
            contentHash: 'a'.repeat(64),
            fileName: 'empty.pdf',
            title: '빈 PDF',
            author: null,
            pdfTitle: null,
            pdfSubject: null,
            pdfKeywords: null,
            publisher: null,
            pdfSize: -1,
            pageCount: 1,
            coverData: null,
            coverMime: null,
            coverStatus: 'fallback',
          },
        },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 17,
          command: 'saveBook',
          payload: {
            pdfData: new ArrayBuffer(1),
            contentHash: '   ',
            fileName: 'empty-hash.pdf',
            title: '빈 해시',
            author: null,
            pdfTitle: null,
            pdfSubject: null,
            pdfKeywords: null,
            publisher: null,
            pdfSize: 1,
            pageCount: 1,
            coverData: null,
            coverMime: null,
            coverStatus: 'fallback',
          },
        },
      }),
    )

    expect(responses).toHaveBeenNthCalledWith(1, {
      requestId: 16,
      error: { code: 'storage-failed' },
    })
    expect(responses).toHaveBeenNthCalledWith(2, {
      requestId: 17,
      error: { code: 'storage-failed' },
    })
    expect(statements).not.toContain(expect.stringContaining('INSERT INTO books'))
  })

  it('범위 밖 읽기 위치를 1페이지로 정정하고 진행률 갱신을 페이지 수로 제한한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)
    vi.mocked(readPdf).mockResolvedValueOnce(new Uint8Array([1, 2, 3]))

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectObject() {
        return {
          id: 'book-1',
          content_hash: 'a'.repeat(64),
          file_name: 'book.pdf',
          title: '책',
          page_count: 3,
          last_page: 10,
        }
      }
      selectValue() {
        return 1
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 11, command: 'getBook', payload: 'book-1' },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: { requestId: 12, command: 'updateProgress', payload: { id: 'book-1', page: 3 } },
      }),
    )

    expect(responses).toHaveBeenNthCalledWith(1, {
      requestId: 11,
      result: expect.objectContaining({ last_page: 1, pdf_data: new Uint8Array([1, 2, 3]) }),
    })
    expect(readPdf).toHaveBeenCalledWith('a'.repeat(64))
    expect(statements).toContain('UPDATE books SET last_page = 1, updated_at = ? WHERE id = ?')
    expect(statements.some((statement) => statement.includes('? <= page_count'))).toBe(true)
  })

  it('책 제목을 수정하고 OPFS 원본과 메타데이터를 함께 삭제한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectValue() {
        return 1
      }
      selectObject() {
        return { id: 'book-1', content_hash: 'a'.repeat(64), page_count: 1, last_page: null }
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: {
          requestId: 13,
          command: 'updateTitle',
          payload: { id: 'book-1', title: ' 새 제목 ' },
        },
      }),
    )
    await handler(
      new MessageEvent('message', {
        data: { requestId: 14, command: 'deleteBook', payload: 'book-1' },
      }),
    )

    expect(statements).toContain('UPDATE books SET title = ?, updated_at = ? WHERE id = ?')
    expect(statements).toContain('DELETE FROM books WHERE id = ?')
    expect(deletePdf).toHaveBeenCalledWith('a'.repeat(64))
    expect(responses).toHaveBeenNthCalledWith(1, { requestId: 13, result: null })
    expect(responses).toHaveBeenNthCalledWith(2, { requestId: 14, result: null })
  })

  it('OPFS 삭제가 실패하면 SQLite 메타데이터는 유지한다', async () => {
    const statements: string[] = []
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)
    vi.mocked(deletePdf).mockRejectedValueOnce(new Error('delete failed'))

    class Database {
      exec(sql: string) {
        statements.push(sql)
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectObject() {
        return { id: 'book-1', content_hash: 'a'.repeat(64), page_count: 1, last_page: null }
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 22, command: 'deleteBook', payload: 'book-1' },
      }),
    )

    expect(statements).not.toContain('DELETE FROM books WHERE id = ?')
    expect(responses).toHaveBeenCalledWith({ requestId: 22, error: { code: 'storage-failed' } })
  })

  it('삭제된 책 확인 요청은 deleted 오류로 응답한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectValue() {
        return undefined
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 15, command: 'hasBook', payload: 'deleted-book' },
      }),
    )

    expect(responses).toHaveBeenCalledWith({ requestId: 15, error: { code: 'deleted' } })
  })

  it('없는 책 조회 요청은 notfound 오류로 응답한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    class Database {
      exec(sql: string) {
        if (sql === 'PRAGMA user_version') return [1]
        return this
      }
      selectObject() {
        return undefined
      }
    }

    vi.mocked(sqlite3InitModule).mockResolvedValue({
      capi: { sqlite3_vfs_find: () => true },
      oo1: { OpfsDb: Database },
    } as never)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', {
        data: { requestId: 13, command: 'getBook', payload: 'missing-book' },
      }),
    )

    expect(responses).toHaveBeenCalledWith({ requestId: 13, error: { code: 'notfound' } })
  })

  it('안전한 양의 정수가 아닌 requestId 메시지는 무시한다', async () => {
    const responses = vi.fn()
    const workerScope = { postMessage: responses, onmessage: null }
    vi.stubGlobal('self', workerScope)

    await import('./ebook-db.worker')
    const handler: unknown = Reflect.get(workerScope, 'onmessage')
    if (typeof handler !== 'function') throw new Error('Worker handler missing')
    await handler(
      new MessageEvent('message', { data: { requestId: Number.NaN, command: 'initialize' } }),
    )

    expect(responses).not.toHaveBeenCalled()
  })
})
