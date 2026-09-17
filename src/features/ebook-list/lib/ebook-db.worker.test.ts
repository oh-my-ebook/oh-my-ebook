import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sqlite.org/sqlite-wasm', () => ({ default: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('ebook-db.worker', () => {
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
      selectValue() {
        return undefined
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
          command: 'addBook',
          payload: {
            pdfData: new ArrayBuffer(2),
            contentHash: 'hash',
            fileName: 'a.pdf',
            title: 'A',
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
        data: { requestId: 8, command: 'addBook', payload: { title: '불완전한 입력' } },
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
      expect.objectContaining({ command: 'addBook', error: expect.any(Error) }),
    )
    expect(consoleError.mock.calls[0][1]).toMatchObject({
      error: expect.objectContaining({ message: 'Invalid payload for addBook' }),
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
