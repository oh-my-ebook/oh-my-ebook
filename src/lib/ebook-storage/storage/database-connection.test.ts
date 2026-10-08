import { afterEach, describe, expect, it, vi } from 'vitest'
import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { createTestDatabase } from '../../../test/sqlocal'

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
    const { getDatabase, closeDatabase } = await import('./database-connection')
    expect(await Promise.all([getDatabase(), getDatabase()])).toEqual([database, database])
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
    await closeDatabase()
    expect(database.destroy).toHaveBeenCalledOnce()
  })

  it('버전 1의 기존 DB를 재생성하지 않고 데이터를 보존한다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    await database.sql("INSERT INTO search_terms(term, document_frequency) VALUES ('기존 용어', 1)")
    const { getDatabase } = await import('./database-connection')
    await getDatabase()
    expect(await database.sql('SELECT term FROM search_terms')).toEqual([{ term: '기존 용어' }])
  })

  it('지원하지 않는 버전은 변경하지 않고 연결을 닫는다', async () => {
    const database = await useDatabase()
    reportOpfs(database)
    await database.sql('PRAGMA user_version = 99')
    const { getDatabase } = await import('./database-connection')
    await expect(getDatabase()).rejects.toThrow('Unsupported schema version')
    expect(database.destroy).toHaveBeenCalledOnce()
  })

  it('OPFS 실패로 메모리 DB를 사용하면 저장소를 사용할 수 없다고 알린다', async () => {
    const database = await useDatabase()
    const { getDatabase } = await import('./database-connection')
    await expect(getDatabase()).rejects.toBeInstanceOf(
      (await import('./errors')).UnsupportedStorageError,
    )
    expect(database.destroy).toHaveBeenCalledOnce()
  })

  it('연결 실패 후 다시 요청하면 새 연결로 재시도한다', async () => {
    const failed = await useDatabase()
    const { getDatabase } = await import('./database-connection')
    await expect(getDatabase()).rejects.toThrow()
    const database = await useDatabase()
    reportOpfs(database)
    expect(await getDatabase()).toBe(database)
    expect(failed.destroy).toHaveBeenCalledOnce()
  })
})
