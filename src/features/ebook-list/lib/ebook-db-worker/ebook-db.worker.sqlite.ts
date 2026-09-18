import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { SQLITE_COMMAND } from '../../ebook-consts'
import type { AddBookInput } from '../../ebook-types'
import {
  DeletedBookError,
  DuplicateBookError,
  NotFoundBookError,
  UnsupportedCommandError,
  UnsupportedStorageError,
} from './ebook-db.worker.error'
import {
  getPayload,
  isAddBookInput,
  isRowAffected,
  isUpdateCoverInput,
  isUpdateProgressInput,
  isUpdateTitleInput,
  normalizeStoredProgress,
  type WorkerRequest,
} from './ebook-db.worker.util'

type SqliteCommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]

const SQLITE_COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(SQLITE_COMMAND))

export function isSqliteCommand(command: string): command is SqliteCommand {
  return SQLITE_COMMAND_LIST.has(command)
}

let databasePromise: Promise<Database> | undefined

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

export function getDatabase(): Promise<Database> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

function getBookId(request: WorkerRequest): string {
  return getPayload(
    request,
    request.command,
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

function listBooks(database: Database): unknown {
  return database.exec(
    `SELECT id, content_hash, file_name, title,
            page_count, cover_data, cover_mime, cover_status,
            last_page, created_at, updated_at
     FROM books ORDER BY created_at DESC, id DESC`,
    { rowMode: 'object', returnValue: 'resultRows' },
  )
}

function hasBook(database: Database, request: WorkerRequest): undefined {
  const id = getBookId(request)
  if (!database.selectValue('SELECT 1 FROM books WHERE id = ?', [id])) {
    throw new DeletedBookError()
  }
  return undefined
}

function getBook(database: Database, request: WorkerRequest): Record<string, unknown> {
  const id = getBookId(request)
  const book = database.selectObject(
    'SELECT id, file_name, title, page_count, pdf_data, last_page FROM books WHERE id = ?',
    [id],
  )
  if (!book) throw new NotFoundBookError()
  return normalizeStoredProgress(database, id, book)
}

function updateProgress(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateProgressInput)
  database.exec(
    `UPDATE books SET last_page = ?, updated_at = ?
     WHERE id = ? AND ? <= page_count`,
    { bind: [input.page, Date.now(), input.id, input.page] },
  )
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

function updateTitle(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateTitleInput)
  database.exec('UPDATE books SET title = ?, updated_at = ? WHERE id = ?', {
    bind: [input.title.trim(), Date.now(), input.id],
  })
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

function deleteBook(database: Database, request: WorkerRequest): undefined {
  const id = getBookId(request)
  database.exec('DELETE FROM books WHERE id = ?', { bind: [id] })
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

function updateCover(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateCoverInput)
  database.exec(
    `UPDATE books SET cover_data = ?, cover_mime = ?, cover_status = 'ready', updated_at = ? WHERE id = ?`,
    {
      bind: [new Uint8Array(input.coverData), input.coverMime, Date.now(), input.id],
    },
  )
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

export function executeSqliteCommand(database: Database, request: WorkerRequest): unknown {
  switch (request.command) {
    case SQLITE_COMMAND.INITIALIZE:
      return undefined
    case SQLITE_COMMAND.LIST_BOOKS:
      return listBooks(database)
    case SQLITE_COMMAND.HAS_BOOK:
      return hasBook(database, request)
    case SQLITE_COMMAND.ADD_BOOK:
      return addBook(database, getPayload(request, request.command, isAddBookInput))
    case SQLITE_COMMAND.GET_BOOK:
      return getBook(database, request)
    case SQLITE_COMMAND.UPDATE_PROGRESS:
      return updateProgress(database, request)
    case SQLITE_COMMAND.UPDATE_TITLE:
      return updateTitle(database, request)
    case SQLITE_COMMAND.DELETE_BOOK:
      return deleteBook(database, request)
    case SQLITE_COMMAND.UPDATE_COVER:
      return updateCover(database, request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
