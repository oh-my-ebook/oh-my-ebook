import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { SQLITE_COMMAND } from '../../ebook-consts'
import type {
  AddBookInput,
  NextOcrPage,
  OcrLinePage,
  OcrLineRecord,
  StoredOcrPage,
} from '../../ebook-types'
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
  SELECT_BOOK_PAGE_COUNT_SQL,
  SELECT_INCOMPLETE_OCR_PAGE_COUNT_SQL,
  SELECT_NEXT_OCR_PAGE_SQL,
  SELECT_OCR_PAGE_BOOK_ID_SQL,
  SELECT_OCR_LINE_COUNT_SQL,
  SELECT_OCR_LINES_SQL,
  SELECT_OCR_PAGE_LINES_SQL,
  SELECT_READY_OCR_PAGE_SQL,
  SET_BOOK_ANALYSIS_FAILED_SQL,
  SET_OCR_COMPLETED_AT_SQL,
  SET_OCR_PAGE_FAILED_SQL,
  SET_OCR_PAGE_PROCESSING_SQL,
  SET_OCR_PAGE_READY_SQL,
  INSERT_OCR_LINE_SQL,
  INSERT_OCR_PAGE_SQL,
  DELETE_OCR_LINES_SQL,
  RESET_PROCESSING_OCR_PAGES_SQL,
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
  isInitializeOcrPagesInput,
  isGetStoredOcrPageInput,
  isListOcrLinesInput,
  isStoreOcrPageInput,
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

// 업로든한 PDF의 페이지 수를 보고 페이지 개수만큼 저장한다.
function initializeOcrPages(database: Database, request: WorkerRequest): undefined {
  const input = getPayload(request, request.command, isInitializeOcrPagesInput)
  if (!database.selectValue(SELECT_BOOK_PAGE_COUNT_SQL, [input.bookId])) {
    throw new NotFoundBookError()
  }

  const now = Date.now()
  database.exec(BEGIN_TRANSACTION_SQL)
  try {
    for (let pageNumber = 1; pageNumber <= input.pageCount; pageNumber += 1) {
      database.exec(INSERT_OCR_PAGE_SQL, {
        bind: [crypto.randomUUID(), input.bookId, pageNumber, now, now],
      })
    }
    database.exec(COMMIT_TRANSACTION_SQL)
  } catch (error) {
    database.exec(ROLLBACK_TRANSACTION_SQL)
    throw error
  }
  return undefined
}

function recoverInterruptedOcrPages(database: Database, request: WorkerRequest): undefined {
  const bookId = getBookId(request)
  database.exec(RESET_PROCESSING_OCR_PAGES_SQL, { bind: [Date.now(), bookId] })
  return undefined
}

function acquireNextOcrPage(database: Database, request: WorkerRequest): NextOcrPage | null {
  const bookId = getBookId(request)
  const now = Date.now()
  database.exec(BEGIN_TRANSACTION_SQL)
  try {
    const page = database.selectObject(SELECT_NEXT_OCR_PAGE_SQL, [bookId])
    if (!page) {
      database.exec(COMMIT_TRANSACTION_SQL)
      return null
    }

    const { id, page_number: pageNumber } = page
    if (typeof id !== 'string' || typeof pageNumber !== 'number')
      throw new Error('Invalid OCR page')
    database.exec(SET_OCR_PAGE_PROCESSING_SQL, { bind: [now, id] })
    if (!isRowAffected(database)) throw new Error('Unable to claim OCR page')
    database.exec(COMMIT_TRANSACTION_SQL)
    return { id, pageNumber }
  } catch (error) {
    database.exec(ROLLBACK_TRANSACTION_SQL)
    throw error
  }
}

function storeOcrPage(database: Database, request: WorkerRequest): boolean {
  const input = getPayload(request, request.command, isStoreOcrPageInput)
  const now = Date.now()
  database.exec(BEGIN_TRANSACTION_SQL)
  try {
    const page = database.selectObject(SELECT_OCR_PAGE_BOOK_ID_SQL, [input.pageId])
    const bookId = page?.book_id
    if (typeof bookId !== 'string') throw new NotFoundBookError()

    database.exec(DELETE_OCR_LINES_SQL, { bind: [input.pageId] })
    input.lines.forEach((line, lineIndex) => {
      database.exec(INSERT_OCR_LINE_SQL, {
        bind: [input.pageId, lineIndex, line.rawText, line.x0, line.y0, line.x1, line.y1],
      })
    })
    database.exec(SET_OCR_PAGE_READY_SQL, {
      bind: [input.width, input.height, now, input.pageId],
    })
    if (!isRowAffected(database)) throw new Error('Unable to store OCR page')

    const incompletePages = database.selectValue(SELECT_INCOMPLETE_OCR_PAGE_COUNT_SQL, [bookId])
    if (incompletePages !== 0) {
      database.exec(COMMIT_TRANSACTION_SQL)
      return false
    }
    database.exec(SET_OCR_COMPLETED_AT_SQL, { bind: [now, now, bookId] })
    database.exec(COMMIT_TRANSACTION_SQL)
    return true
  } catch (error) {
    database.exec(ROLLBACK_TRANSACTION_SQL)
    throw error
  }
}

function failOcrPage(database: Database, request: WorkerRequest): undefined {
  const pageId = getBookId(request)
  database.exec(SET_OCR_PAGE_FAILED_SQL, { bind: [Date.now(), pageId] })
  if (!isRowAffected(database)) throw new NotFoundBookError()
  return undefined
}

function failBookAnalysis(database: Database, request: WorkerRequest): undefined {
  const bookId = getBookId(request)
  database.exec(SET_BOOK_ANALYSIS_FAILED_SQL, { bind: [Date.now(), bookId] })
  if (!isRowAffected(database)) throw new NotFoundBookError()
  return undefined
}

function isOcrLineRecord(value: unknown): value is OcrLineRecord {
  if (!isStoredOcrLine(value)) return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('line_index' in value) || typeof value.line_index !== 'number') return false
  return true
}

function isStoredOcrLine(value: unknown): value is {
  raw_text: string
  x0: number
  y0: number
  x1: number
  y1: number
} {
  if (typeof value !== 'object' || value === null) return false
  if (!('raw_text' in value) || typeof value.raw_text !== 'string') return false
  if (!('x0' in value) || typeof value.x0 !== 'number') return false
  if (!('y0' in value) || typeof value.y0 !== 'number') return false
  if (!('x1' in value) || typeof value.x1 !== 'number') return false
  if (!('y1' in value) || typeof value.y1 !== 'number') return false
  return true
}

function getStoredOcrPage(database: Database, request: WorkerRequest): StoredOcrPage | null {
  const input = getPayload(request, request.command, isGetStoredOcrPageInput)
  const page = database.selectObject(SELECT_READY_OCR_PAGE_SQL, [input.bookId, input.pageNumber])
  if (!page) return null
  const { id, width, height } = page
  if (
    typeof id !== 'string' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Invalid stored OCR page')
  }
  const lines = database.exec(SELECT_OCR_PAGE_LINES_SQL, {
    bind: [id],
    rowMode: 'object',
    returnValue: 'resultRows',
  })
  if (!Array.isArray(lines)) throw new Error('Invalid stored OCR lines')
  const storedLines = []
  for (const line of lines) {
    if (!isStoredOcrLine(line)) throw new Error('Invalid stored OCR lines')
    storedLines.push({
      rawText: line.raw_text,
      x0: line.x0,
      y0: line.y0,
      x1: line.x1,
      y1: line.y1,
    })
  }
  return { width, height, lines: storedLines }
}

function listOcrLines(database: Database, request: WorkerRequest): OcrLinePage {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = database.selectValue(SELECT_OCR_LINE_COUNT_SQL, [input.bookId])
  if (typeof total !== 'number') throw new Error('Invalid OCR line count')
  const lines = database.exec(SELECT_OCR_LINES_SQL, {
    bind: [input.bookId, input.limit, input.offset],
    rowMode: 'object',
    returnValue: 'resultRows',
  })
  if (!Array.isArray(lines)) throw new Error('Invalid OCR lines')
  const ocrLines: OcrLineRecord[] = []
  for (const line of lines) {
    if (!isOcrLineRecord(line)) throw new Error('Invalid OCR lines')
    ocrLines.push({
      page_number: line.page_number,
      line_index: line.line_index,
      raw_text: line.raw_text,
      x0: line.x0,
      y0: line.y0,
      x1: line.x1,
      y1: line.y1,
    })
  }
  return { lines: ocrLines, total }
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
    case SQLITE_COMMAND.INITIALIZE_OCR_PAGES:
      return initializeOcrPages(database, request)
    case SQLITE_COMMAND.RECOVER_INTERRUPTED_OCR_PAGES:
      return recoverInterruptedOcrPages(database, request)
    case SQLITE_COMMAND.ACQUIRE_NEXT_OCR_PAGE:
      return acquireNextOcrPage(database, request)
    case SQLITE_COMMAND.STORE_OCR_PAGE:
      return storeOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_OCR_PAGE:
      return failOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_BOOK_ANALYSIS:
      return failBookAnalysis(database, request)
    case SQLITE_COMMAND.LIST_OCR_LINES:
      return listOcrLines(database, request)
    case SQLITE_COMMAND.GET_STORED_OCR_PAGE:
      return getStoredOcrPage(database, request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
