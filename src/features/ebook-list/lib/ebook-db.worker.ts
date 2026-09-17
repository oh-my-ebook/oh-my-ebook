/// <reference lib="webworker" />

import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import type { AddBookInput, EbookStoreErrorCode, EbookStoreResponse } from '../ebook-types'

const workerScope = self as DedicatedWorkerGlobalScope
let databasePromise: Promise<Database> | undefined

class UnsupportedStorageError extends Error {}
class DuplicateBookError extends Error {}
class DeletedBookError extends Error {}
class InvalidPayloadError extends Error {
  constructor(command: string) {
    super(`Invalid payload for ${command}`)
  }
}
class UnsupportedCommandError extends Error {
  constructor(command: string) {
    super(`Unsupported command: ${command}`)
  }
}

interface UpdateCoverInput {
  id: string
  coverData: ArrayBuffer
  coverMime: 'image/webp' | 'image/png'
}

interface UpdateProgressInput {
  id: string
  page: number
}

interface UpdateTitleInput {
  id: string
  title: string
}

interface WorkerRequest {
  requestId: number
  command: string
  payload?: unknown
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestId' in value &&
    typeof value.requestId === 'number' &&
    Number.isSafeInteger(value.requestId) &&
    value.requestId > 0 &&
    'command' in value &&
    typeof value.command === 'string'
  )
}

function isAddBookInput(value: unknown): value is AddBookInput {
  if (typeof value !== 'object' || value === null) return false
  return (
    'pdfData' in value &&
    value.pdfData instanceof ArrayBuffer &&
    'contentHash' in value &&
    typeof value.contentHash === 'string' &&
    'fileName' in value &&
    typeof value.fileName === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'pageCount' in value &&
    Number.isSafeInteger(value.pageCount) &&
    Number(value.pageCount) > 0 &&
    'coverData' in value &&
    (value.coverData === null || value.coverData instanceof ArrayBuffer) &&
    'coverMime' in value &&
    (value.coverMime === null ||
      value.coverMime === 'image/webp' ||
      value.coverMime === 'image/png') &&
    'coverStatus' in value &&
    (value.coverStatus === 'ready' || value.coverStatus === 'fallback')
  )
}

function isUpdateCoverInput(value: unknown): value is UpdateCoverInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'coverData' in value &&
    value.coverData instanceof ArrayBuffer &&
    'coverMime' in value &&
    (value.coverMime === 'image/webp' || value.coverMime === 'image/png')
  )
}

function isUpdateProgressInput(value: unknown): value is UpdateProgressInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'page' in value &&
    typeof value.page === 'number' &&
    Number.isSafeInteger(value.page) &&
    value.page > 0
  )
}

function isUpdateTitleInput(value: unknown): value is UpdateTitleInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'title' in value &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0
  )
}

function getPayload<T>(
  request: WorkerRequest,
  command: string,
  isValid: (value: unknown) => value is T,
): T {
  if (!isValid(request.payload)) throw new InvalidPayloadError(command)
  return request.payload
}

function normalizeStoredProgress(
  database: Database,
  id: string,
  book: Record<string, unknown>,
): Record<string, unknown> {
  const pageCount = book.page_count
  const lastPage = book.last_page
  if (
    lastPage === null ||
    (typeof pageCount === 'number' &&
      Number.isSafeInteger(pageCount) &&
      pageCount > 0 &&
      typeof lastPage === 'number' &&
      Number.isSafeInteger(lastPage) &&
      lastPage >= 1 &&
      lastPage <= pageCount)
  ) {
    return book
  }

  database.exec('UPDATE books SET last_page = 1, updated_at = ? WHERE id = ?', {
    bind: [Date.now(), id],
  })
  return { ...book, last_page: 1 }
}

function addBook(database: Database, input: AddBookInput): string {
  if (database.selectValue('SELECT id FROM books WHERE content_hash = ?', [input.contentHash])) {
    throw new DuplicateBookError()
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(
      `INSERT INTO books (
        id, content_hash, file_name, title, page_count,
        pdf_data, cover_data, cover_mime, cover_status, last_page, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      {
        bind: [
          id,
          input.contentHash,
          input.fileName,
          input.title,
          input.pageCount,
          new Uint8Array(input.pdfData),
          input.coverData ? new Uint8Array(input.coverData) : null,
          input.coverMime,
          input.coverStatus,
          now,
          now,
        ],
      },
    )
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  return id
}

async function openDatabase(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule()
  if (!sqlite3.capi.sqlite3_vfs_find('opfs')) throw new UnsupportedStorageError()

  const database = new sqlite3.oo1.OpfsDb('/ebook-library.sqlite3')
  try {
    const version = database.exec('PRAGMA user_version', {
      rowMode: 0,
      returnValue: 'resultRows',
    })[0]
    if (version === 0) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(`
          CREATE TABLE books (
            id TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            title TEXT NOT NULL,
            page_count INTEGER NOT NULL CHECK (page_count > 0),
            pdf_data BLOB NOT NULL,
            cover_data BLOB,
            cover_mime TEXT,
            cover_status TEXT NOT NULL CHECK (cover_status IN ('ready', 'fallback')),
            last_page INTEGER CHECK (
              last_page IS NULL OR (last_page >= 1 AND last_page <= page_count)
            ),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX books_created_at_idx ON books(created_at DESC, id DESC);
          PRAGMA user_version = 1;
        `)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    } else if (version !== 1) {
      throw new Error('Unsupported schema version')
    }
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

function getDatabase(): Promise<Database> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

function getErrorCode(error: unknown): EbookStoreErrorCode {
  if (error instanceof UnsupportedStorageError) return 'unsupported'
  if (error instanceof DuplicateBookError) return 'duplicate'
  if (error instanceof DeletedBookError) return 'deleted'
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    if (error.resultCode === 5 || error.resultCode === 6) return 'locked'
    if (error.resultCode === 13) return 'quota'
  }
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: books.content_hash')
  ) {
    return 'duplicate'
  }
  return 'storage-failed'
}

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  if (!isWorkerRequest(event.data)) return

  const { requestId, command } = event.data
  try {
    const database = await getDatabase()
    let result: unknown = null
    switch (command) {
      case 'initialize':
        break
      case 'listBooks':
        result = database.exec(
          `SELECT id, content_hash, file_name, title,
                  page_count, cover_data, cover_mime, cover_status,
                  last_page, created_at, updated_at
           FROM books ORDER BY created_at DESC, id DESC`,
          { rowMode: 'object', returnValue: 'resultRows' },
        )
        break
      case 'addBook':
        result = addBook(database, getPayload(event.data, command, isAddBookInput))
        break
      case 'getBook': {
        const id = getPayload(
          event.data,
          command,
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
        const book = database.selectObject(
          'SELECT id, file_name, title, page_count, pdf_data, last_page FROM books WHERE id = ?',
          [id],
        )
        if (!book) throw new DeletedBookError()
        result = normalizeStoredProgress(database, id, book)
        break
      }
      case 'updateProgress': {
        const input = getPayload(event.data, command, isUpdateProgressInput)
        database.exec(
          `UPDATE books SET last_page = ?, updated_at = ?
           WHERE id = ? AND ? <= page_count`,
          { bind: [input.page, Date.now(), input.id, input.page] },
        )
        if (database.selectValue('SELECT changes()') !== 1) throw new DeletedBookError()
        break
      }
      case 'updateTitle': {
        const input = getPayload(event.data, command, isUpdateTitleInput)
        database.exec('UPDATE books SET title = ?, updated_at = ? WHERE id = ?', {
          bind: [input.title.trim(), Date.now(), input.id],
        })
        if (database.selectValue('SELECT changes()') !== 1) throw new DeletedBookError()
        break
      }
      case 'deleteBook': {
        const id = getPayload(
          event.data,
          command,
          (value): value is string => typeof value === 'string' && value.length > 0,
        )
        database.exec('DELETE FROM books WHERE id = ?', { bind: [id] })
        if (database.selectValue('SELECT changes()') !== 1) throw new DeletedBookError()
        break
      }
      case 'updateCover': {
        const input = getPayload(event.data, command, isUpdateCoverInput)
        database.exec(
          `UPDATE books SET cover_data = ?, cover_mime = ?, cover_status = 'ready', updated_at = ? WHERE id = ?`,
          {
            bind: [new Uint8Array(input.coverData), input.coverMime, Date.now(), input.id],
          },
        )
        if (database.selectValue('SELECT changes()') !== 1) throw new DeletedBookError()
        break
      }
      default:
        throw new UnsupportedCommandError(command)
    }
    workerScope.postMessage({ requestId, result } satisfies EbookStoreResponse)
  } catch (error) {
    const code = getErrorCode(error)
    if (code === 'storage-failed') {
      console.error('ebook-db.worker command failed', { command, error })
    }
    workerScope.postMessage({
      requestId,
      error: { code },
    } satisfies EbookStoreResponse)
  }
}
