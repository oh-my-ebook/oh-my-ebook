import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { UnsupportedStorageError } from './storage-errors'
import { ENABLE_FOREIGN_KEYS_SQL, GET_SCHEMA_VERSION_SQL, INITIAL_SCHEMA_SQL } from './schema-sql'

export interface DatabaseConnection {
  sqlocal: SQLocalDrizzle
  db: SqliteRemoteDatabase
}

export const sqlocal = new SQLocalDrizzle({
  databasePath: '/ebook-library.sqlite3',
  onInit: (sql) => [sql(ENABLE_FOREIGN_KEYS_SQL)],
})
const { driver, batchDriver } = sqlocal
export const db = drizzle(driver, batchDriver)

let initializationPromise: Promise<void> | undefined

async function initializeSchema(): Promise<void> {
  // SQLocal의 메모리 DB fallback을 영구 저장 성공으로 처리하지 않는다.
  const { storageType } = await sqlocal.getDatabaseInfo()
  if (storageType !== 'opfs') throw new UnsupportedStorageError()

  await sqlocal.transaction(async (tx) => {
    const [row] = await tx.sql<{ user_version: number }>(GET_SCHEMA_VERSION_SQL)
    if (row?.user_version === 0) {
      await tx.sql(INITIAL_SCHEMA_SQL)
    } else if (row?.user_version !== 1) {
      throw new Error('Unsupported schema version')
    }
  })
}

export async function initializeDatabase(): Promise<void> {
  initializationPromise ??= initializeSchema().catch((error: unknown) => {
    initializationPromise = undefined
    throw error
  })
  await initializationPromise
}

export async function resetDatabase(): Promise<void> {
  initializationPromise = undefined
  await sqlocal.deleteDatabaseFile(async () => {
    // 삭제 콜백은 이미 DB 잠금을 보유한다. SQLocal transaction()은 같은 잠금을 다시 기다린다.
    await sqlocal.sql('BEGIN')
    try {
      await sqlocal.sql(INITIAL_SCHEMA_SQL)
      await sqlocal.sql('COMMIT')
    } catch (error) {
      await sqlocal.sql('ROLLBACK')
      throw error
    }
  })
  await initializeDatabase()
}
