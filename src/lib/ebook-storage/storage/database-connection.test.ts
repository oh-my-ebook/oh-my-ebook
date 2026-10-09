import { locks } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { createTestDatabase } from '../../../test/sqlocal'
import { searchTerms } from '../schema'

vi.mock('sqlocal/drizzle', () => ({ SQLocalDrizzle: vi.fn() }))
afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

async function useDatabase(schema?: string) {
  const database = await createTestDatabase(schema)
  vi.mocked(SQLocalDrizzle).mockImplementation(function () {
    return database
  })
  return database
}

function reportOpfs(database: SQLocalDrizzle) {
  vi.spyOn(database, 'getDatabaseInfo').mockResolvedValue({
    databasePath: '/ebook-library.sqlite3',
    storageType: 'opfs',
    databaseSizeBytes: 0,
    persisted: true,
  })
}

describe('SQLocal 연결', () => {
  it('기존 파일 경로를 유지하고 새 DB를 한 번만 초기화한다', async () => {
    const database = await useDatabase('')
    reportOpfs(database)
    const { initializeDatabase, db } = await import('./database-connection')
    await Promise.all([initializeDatabase(), initializeDatabase()])
    expect(db).toBe((await import('./database-connection')).db)
    expect(SQLocalDrizzle).toHaveBeenCalledOnce()
    expect(SQLocalDrizzle).toHaveBeenCalledWith(
      expect.objectContaining({
        databasePath: '/ebook-library.sqlite3',
        onInit: expect.any(Function),
      }),
    )
    expect(await database.sql('PRAGMA user_version')).toEqual([{ user_version: 1 }])
    expect(await database.sql("SELECT name FROM sqlite_master WHERE type = 'table'")).toHaveLength(
      7,
    )
  })

  it('버전 1의 기존 DB를 재생성하지 않고 데이터를 보존한다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    await database.sql("INSERT INTO search_terms(term, document_frequency) VALUES ('기존 용어', 1)")
    const { initializeDatabase } = await import('./database-connection')
    await initializeDatabase()
    expect(await database.sql('SELECT term FROM search_terms')).toEqual([{ term: '기존 용어' }])
  })

  it('지원하지 않는 버전은 데이터를 변경하지 않고 오류를 알린다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    await database.sql('PRAGMA user_version = 99')
    const { initializeDatabase } = await import('./database-connection')
    await expect(initializeDatabase()).rejects.toThrow('Unsupported schema version')
    expect(await database.sql('PRAGMA user_version')).toEqual([{ user_version: 99 }])
  })

  it('OPFS 실패로 메모리 DB를 사용하면 저장소를 사용할 수 없다고 알린다', async () => {
    const database = await useDatabase()
    const { initializeDatabase } = await import('./database-connection')
    await expect(initializeDatabase()).rejects.toBeInstanceOf(
      (await import('./errors')).UnsupportedStorageError,
    )
    expect(database.destroy).not.toHaveBeenCalled()
  })

  it('초기화 중 일시적인 오류가 나면 같은 연결로 재시도한다', async () => {
    const database = await useDatabase('')
    reportOpfs(database)
    vi.mocked(database.getDatabaseInfo).mockRejectedValueOnce(new Error('temporary failure'))
    const { initializeDatabase } = await import('./database-connection')
    await expect(initializeDatabase()).rejects.toThrow('temporary failure')
    await initializeDatabase()
    expect(await database.sql('PRAGMA user_version')).toEqual([{ user_version: 1 }])
    expect(SQLocalDrizzle).toHaveBeenCalledOnce()
  })

  it('Drizzle 조회와 batch가 같은 SQLite 연결에서 실행된다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    const { initializeDatabase, db } = await import('./database-connection')
    await initializeDatabase()
    await db.batch([
      db.insert(searchTerms).values({ term: '검색', documentFrequency: 1 }),
      db.insert(searchTerms).values({ term: '독서', documentFrequency: 2 }),
    ])
    expect(
      await db.select({ term: searchTerms.term }).from(searchTerms).orderBy(searchTerms.term),
    ).toEqual([{ term: '검색' }, { term: '독서' }])
    expect(await database.sql('SELECT COUNT(*) AS total FROM search_terms')).toEqual([{ total: 2 }])
  })

  it('Web Locks가 활성화되어도 전체 삭제 후 같은 Drizzle 객체로 다시 저장한다', async () => {
    vi.stubGlobal('navigator', { locks })
    const database = await useDatabase()
    reportOpfs(database)
    const { initializeDatabase, resetDatabase, db } = await import('./database-connection')
    await initializeDatabase()
    await db.insert(searchTerms).values({ term: '삭제할 용어', documentFrequency: 1 })
    await resetDatabase()
    expect(await db.select().from(searchTerms)).toEqual([])
    expect(await database.sql('PRAGMA user_version')).toEqual([{ user_version: 1 }])
    expect(await database.sql('PRAGMA foreign_keys')).toEqual([{ foreign_keys: 1 }])
    await db.insert(searchTerms).values({ term: '새 용어', documentFrequency: 1 })
    expect(await db.select({ term: searchTerms.term }).from(searchTerms)).toEqual([
      { term: '새 용어' },
    ])
    expect(database.destroy).not.toHaveBeenCalled()
    expect(SQLocalDrizzle).toHaveBeenCalledOnce()
  })

  it('삭제 후 스키마 초기화가 실패해도 다음 초기화에서 복구한다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    const { initializeDatabase, resetDatabase, db } = await import('./database-connection')
    await initializeDatabase()
    const executeSql = database.sql
    vi.spyOn(database, 'sql')
      .mockImplementationOnce(executeSql)
      .mockImplementationOnce(async () => {
        return await executeSql('CREATE TABLE books(id TEXT); SELECT * FROM missing_table;')
      })
    await expect(resetDatabase()).rejects.toThrow('missing_table')
    expect(await database.sql("SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual([])
    await initializeDatabase()
    expect(await db.select().from(searchTerms)).toEqual([])
    expect(await database.sql('PRAGMA user_version')).toEqual([{ user_version: 1 }])
  })
})
