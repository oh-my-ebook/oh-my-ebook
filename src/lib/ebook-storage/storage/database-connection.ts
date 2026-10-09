import { SQLocalDrizzle } from 'sqlocal/drizzle'
import { UnsupportedStorageError } from './errors'
import { ENABLE_FOREIGN_KEYS_SQL, GET_SCHEMA_VERSION_SQL, INITIAL_SCHEMA_SQL } from './schema-sql'

let databasePromise: Promise<SQLocalDrizzle> | undefined

async function openDatabase(): Promise<SQLocalDrizzle> {
  const database = new SQLocalDrizzle({
    databasePath: '/ebook-library.sqlite3',
    onInit: (sql) => [sql(ENABLE_FOREIGN_KEYS_SQL)],
  })
  try {
    // SQLocal의 메모리 DB fallback을 영구 저장 성공으로 처리하지 않는다.
    const { storageType } = await database.getDatabaseInfo()
    if (storageType !== 'opfs') throw new UnsupportedStorageError()

    await database.transaction(async (tx) => {
      const [row] = await tx.sql<{ user_version: number }>(GET_SCHEMA_VERSION_SQL)
      if (row?.user_version === 0) {
        await tx.sql(INITIAL_SCHEMA_SQL)
      } else if (row?.user_version !== 1) {
        throw new Error('Unsupported schema version')
      }
    })
    return database
  } catch (error) {
    await database.destroy()
    throw error
  }
}

export function getDatabase(): Promise<SQLocalDrizzle> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export async function closeDatabase(): Promise<void> {
  const database = await databasePromise
  await database?.destroy()
  databasePromise = undefined
}
