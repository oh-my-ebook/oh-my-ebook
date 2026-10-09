import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { DatabaseConnection } from '../lib/ebook-storage/storage/database-connection'
import { onTestFinished, vi } from 'vitest'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import type { AddBookInput } from '../lib/ebook-storage/data/book'
import { INITIAL_SCHEMA_SQL } from '../lib/ebook-storage/storage/schema-sql'

export async function createTestDatabase(schema = INITIAL_SCHEMA_SQL) {
  const { SQLocalDrizzle } =
    await vi.importActual<typeof import('sqlocal/drizzle')>('sqlocal/drizzle')
  if (typeof Worker === 'undefined') vi.stubGlobal('Worker', class {})
  const database = await new Promise<SQLocalDrizzle>((resolve) => {
    const client = new SQLocalDrizzle({
      databasePath: ':memory:',
      onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
      onConnect: () => resolve(client),
    })
    let destroyed = false
    const destroy = client.destroy
    vi.spyOn(client, 'destroy').mockImplementation(async () => {
      await destroy()
      destroyed = true
    })
    onTestFinished(async () => {
      if (!destroyed) await destroy()
      vi.unstubAllGlobals()
    })
  })
  if (schema) await database.sql(schema)
  return database
}

export function createBookInput(overrides: Partial<AddBookInput> = {}): AddBookInput {
  return {
    pdfData: new Uint8Array([1, 2, 3]).buffer,
    contentHash: 'a'.repeat(64),
    fileName: 'book.pdf',
    title: '책',
    author: null,
    pdfTitle: null,
    pdfSubject: null,
    pdfKeywords: null,
    publisher: null,
    pdfSize: 3,
    pageCount: 2,
    coverData: null,
    coverMime: null,
    coverStatus: 'fallback',
    ...overrides,
  }
}

export async function createTestConnection(
  schema = INITIAL_SCHEMA_SQL,
): Promise<DatabaseConnection> {
  const sqlocal = await createTestDatabase(schema)
  const db = drizzle(sqlocal.driver, sqlocal.batchDriver)
  return { sqlocal, db }
}
