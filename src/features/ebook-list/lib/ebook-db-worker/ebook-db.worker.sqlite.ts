import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { SQLITE_COMMAND } from '../../ebook-consts'
import type { AddBookInput } from '../../ebook-types'
import {
  BEGIN_TRANSACTION_SQL,
  COMMIT_TRANSACTION_SQL,
  DELETE_BOOK_BY_ID_SQL,
  ENABLE_FOREIGN_KEYS_SQL,
  GET_SCHEMA_VERSION_SQL,
  INITIAL_SCHEMA_SQL,
  INSERT_BOOK_SQL,
  ROLLBACK_TRANSACTION_SQL,
  SELECT_BOOK_EXISTS_SQL,
  SELECT_BOOK_ID_BY_CONTENT_HASH_SQL,
  SELECT_BOOK_METADATA_SQL,
  SELECT_BOOKS_SQL,
  UPDATE_BOOK_COVER_SQL,
  UPDATE_BOOK_PROGRESS_SQL,
  UPDATE_BOOK_TITLE_SQL,
} from './ebook-db.worker.sql'
import {
  DeletedBookError,
  DuplicateBookError,
  NotFoundBookError,
  UnsupportedCommandError,
  UnsupportedStorageError,
} from './ebook-db.worker.error'
import {
  getPayload,
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

export function addBook(database: Database, input: AddBookInput): string {
  if (database.selectValue(SELECT_BOOK_ID_BY_CONTENT_HASH_SQL, [input.contentHash])) {
    throw new DuplicateBookError()
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  database.exec(BEGIN_TRANSACTION_SQL)
  try {
    database.exec(INSERT_BOOK_SQL, {
      bind: [
        id,
        input.contentHash,
        input.fileName,
        input.title,
        input.author,
        input.pdfTitle,
        input.pdfSubject,
        input.pdfKeywords,
        input.publisher,
        input.pdfSize,
        input.pageCount,
        input.coverData ? new Uint8Array(input.coverData) : null,
        input.coverMime,
        input.coverStatus,
        'analyzing',
        null,
        null,
        now,
        now,
      ],
    })
    database.exec(COMMIT_TRANSACTION_SQL)
  } catch (error) {
    database.exec(ROLLBACK_TRANSACTION_SQL)
    throw error
  }
  return id
}

export function deleteBookById(database: Database, id: string): void {
  database.exec(DELETE_BOOK_BY_ID_SQL, { bind: [id] })

  if (!isRowAffected(database)) throw new DeletedBookError()
}

async function openDatabase(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule()
  if (!sqlite3.capi.sqlite3_vfs_find('opfs')) throw new UnsupportedStorageError()

  const database = new sqlite3.oo1.OpfsDb('/ebook-library.sqlite3')
  try {
    database.exec(ENABLE_FOREIGN_KEYS_SQL)
    const version = database.exec(GET_SCHEMA_VERSION_SQL, {
      rowMode: 0,
      returnValue: 'resultRows',
    })[0]
    if (version === 0) {
      database.exec(BEGIN_TRANSACTION_SQL)
      try {
        database.exec(INITIAL_SCHEMA_SQL)
        database.exec(COMMIT_TRANSACTION_SQL)
      } catch (error) {
        database.exec(ROLLBACK_TRANSACTION_SQL)
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

export function getBookId(request: WorkerRequest): string {
  return getPayload(
    request,
    request.command,
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
}

export function listBooks(database: Database): unknown {
  return database.exec(SELECT_BOOKS_SQL, { rowMode: 'object', returnValue: 'resultRows' })
}

function hasBook(database: Database, request: WorkerRequest): undefined {
  const id = getBookId(request)
  if (!database.selectValue(SELECT_BOOK_EXISTS_SQL, [id])) {
    throw new DeletedBookError()
  }
  return undefined
}

export function getBookMetadata(database: Database, id: string): Record<string, unknown> {
  const book = database.selectObject(SELECT_BOOK_METADATA_SQL, [id])
  if (!book) throw new NotFoundBookError()
  return normalizeStoredProgress(database, id, book)
}

function updateProgress(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateProgressInput)
  database.exec(UPDATE_BOOK_PROGRESS_SQL, { bind: [input.page, Date.now(), input.id, input.page] })
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

function updateTitle(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateTitleInput)
  database.exec(UPDATE_BOOK_TITLE_SQL, {
    bind: [input.title.trim(), Date.now(), input.id],
  })
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

function updateCover(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isUpdateCoverInput)
  database.exec(UPDATE_BOOK_COVER_SQL, {
    bind: [new Uint8Array(input.coverData), input.coverMime, Date.now(), input.id],
  })
  if (!isRowAffected(database)) throw new DeletedBookError()
  return undefined
}

export function executeSqliteCommand(database: Database, request: WorkerRequest): unknown {
  switch (request.command) {
    case SQLITE_COMMAND.INITIALIZE:
      return undefined
    case SQLITE_COMMAND.HAS_BOOK:
      return hasBook(database, request)
    case SQLITE_COMMAND.UPDATE_PROGRESS:
      return updateProgress(database, request)
    case SQLITE_COMMAND.UPDATE_TITLE:
      return updateTitle(database, request)
    case SQLITE_COMMAND.UPDATE_COVER:
      return updateCover(database, request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
