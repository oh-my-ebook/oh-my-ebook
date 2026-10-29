import { createDrizzleDatabase } from '../lib/ebook-storage/drizzle-database'
import type { DatabaseConnection } from '../lib/ebook-storage/database-connection'
import { onTestFinished, vi } from 'vitest'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import type { ImportedBook, Book } from '../lib/ebook-storage/types/book'
import { INITIAL_SCHEMA_SQL } from '../lib/ebook-storage/schema-sql'

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

export function createImportedBook(overrides: Partial<ImportedBook> = {}): ImportedBook {
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
    ...overrides,
  }
}

export function createNewBook(overrides: Partial<Book> = {}): Book {
  return {
    id: crypto.randomUUID(),
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
    lastPage: null,
    analysisStatus: 'analyzing',
    ocrCompletedAt: null,
    indexedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

export async function createTestConnection(
  schema = INITIAL_SCHEMA_SQL,
): Promise<DatabaseConnection> {
  const sqlocal = await createTestDatabase(schema)
  const db = createDrizzleDatabase(sqlocal)
  return { sqlocal, db }
}
