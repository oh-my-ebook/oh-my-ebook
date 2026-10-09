import { COMMAND } from '../commands'
import { UnsupportedCommandError } from './errors'
import { executeSqliteCommand, isSqliteCommand } from './database'
import { type StorageRequest, getPayload, getBookId } from './validation'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import type { EbookStore } from '../ebook-store'
import type { AddBookInput, StoredBook, StoredBookDetail } from '../data/book'
import { closeDatabase, getDatabase } from './database-connection'
import { clearOpfs, deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import * as bookDb from './books'
import * as ocrDb from './ocr'
import * as searchDb from './search'
import {
  validateInput,
  isContentHash,
  isAddBookInput,
  isGetStoredOcrPageInput,
  isIdentifier,
  isInitializeOcrPagesInput,
  isListOcrLinesInput,
  isSearchChunkQuery,
  isStoreOcrPageInput,
  isStoreSearchIndexInput,
  isUpdateCoverInput,
  isUpdateProgressInput,
  isUpdateTitleInput,
} from './validation'

/**
 * SQLite에 메타 데이터를 먼저 저장한 후, 콘텐츠 해시를 기준으로 OPFS에 PDF 파일 저장
 * 만약 OPFS 저장에 실패하면 SQLite에 저장한 메타 데이터를 삭제
 */
async function saveBook(input: AddBookInput): Promise<string> {
  validateInput(input, 'saveBook', isAddBookInput)
  const database = await getDatabase()
  const id = await bookDb.addBook(database, input)

  try {
    await writePdf(input.contentHash, input.pdfData)
    return id
  } catch (error) {
    try {
      await bookDb.deleteBookById(database, id)
    } catch {
      console.error('Failed to delete book from SQLite', { id })
    }
    throw error
  }
}

async function getBook(id: string): Promise<StoredBookDetail> {
  validateInput(id, 'bookId', isIdentifier)
  const book = await bookDb.getBookMetadata(await getDatabase(), id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  return { ...book, pdf_data: await readPdf(contentHash) }
}

async function listLibraryBooks(): Promise<StoredBook[]> {
  const books = await bookDb.listBooks(await getDatabase())

  return await Promise.all(
    books.map(async (book) => {
      if (!isContentHash(book.content_hash)) throw new Error('Invalid content hash')

      return { ...book, pdf_status: (await hasPdf(book.content_hash)) ? 'available' : 'missing' }
    }),
  )
}

/**
 * OPFS에 저장된 PDF 파일을 삭제한 후, SQLite에 저장된 메타 데이터를 삭제
 * 만약 OPFS 삭제에 실패하면 Error를 발생
 */
async function deleteBook(id: string): Promise<void> {
  validateInput(id, 'bookId', isIdentifier)
  const database = await getDatabase()
  const book = await bookDb.getBookMetadata(database, id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  await deletePdf(contentHash)
  await bookDb.deleteBookById(database, id)
}

async function clearStorage(): Promise<void> {
  await closeDatabase()
  await clearOpfs()
}

async function withDatabase<Input, Result>(
  name: keyof EbookStore,
  operation: (database: SQLocalDrizzle, input: Input) => Promise<Result>,
  input: Input,
  isValid: (value: unknown) => value is Input,
): Promise<Result> {
  validateInput(input, name, isValid)
  return await operation(await getDatabase(), input)
}

export const storeOperations: EbookStore = {
  async initialize() {
    await getDatabase()
  },
  clearStorage,
  saveBook,
  getBook,
  deleteBook,
  listBooks: listLibraryBooks,
  hasBook: (id) => withDatabase('hasBook', bookDb.hasBook, id, isIdentifier),
  updateProgress: (input) =>
    withDatabase('updateProgress', bookDb.updateProgress, input, isUpdateProgressInput),
  updateTitle: (input) =>
    withDatabase('updateTitle', bookDb.updateTitle, input, isUpdateTitleInput),
  updateCover: (input) =>
    withDatabase('updateCover', bookDb.updateCover, input, isUpdateCoverInput),
  initializeOcrPages: (input) =>
    withDatabase('initializeOcrPages', ocrDb.initializeOcrPages, input, isInitializeOcrPagesInput),
  prepareOcrPagesForRun: (bookId) =>
    withDatabase('prepareOcrPagesForRun', ocrDb.prepareOcrPagesForRun, bookId, isIdentifier),
  acquireNextOcrPage: (bookId) =>
    withDatabase('acquireNextOcrPage', ocrDb.acquireNextOcrPage, bookId, isIdentifier),
  storeOcrPage: (input) =>
    withDatabase('storeOcrPage', ocrDb.storeOcrPage, input, isStoreOcrPageInput),
  failOcrPage: (pageId) => withDatabase('failOcrPage', ocrDb.failOcrPage, pageId, isIdentifier),
  failBookAnalysis: (bookId) =>
    withDatabase('failBookAnalysis', bookDb.failBookAnalysis, bookId, isIdentifier),
  getBookAnalysisStatus: (bookId) =>
    withDatabase('getBookAnalysisStatus', bookDb.getBookAnalysisStatus, bookId, isIdentifier),
  retryBookAnalysis: (bookId) =>
    withDatabase('retryBookAnalysis', bookDb.retryBookAnalysis, bookId, isIdentifier),
  getStoredOcrPage: (input) =>
    withDatabase('getStoredOcrPage', ocrDb.getStoredOcrPage, input, isGetStoredOcrPageInput),
  listOcrPages: (bookId) => withDatabase('listOcrPages', ocrDb.listOcrPages, bookId, isIdentifier),
  listOcrLines: (input) =>
    withDatabase('listOcrLines', ocrDb.listOcrLines, input, isListOcrLinesInput),
  getOcrLinesForChunking: (bookId) =>
    withDatabase('getOcrLinesForChunking', ocrDb.getOcrLinesForChunking, bookId, isIdentifier),
  storeSearchIndex: (input) =>
    withDatabase('storeSearchIndex', searchDb.storeSearchIndex, input, isStoreSearchIndexInput),
  listSearchChunks: (input) =>
    withDatabase('listSearchChunks', searchDb.listSearchChunks, input, isListOcrLinesInput),
  searchChunks: (query) =>
    withDatabase('searchChunks', searchDb.searchChunks, query, isSearchChunkQuery),
  listSearchTerms: (input) =>
    withDatabase('listSearchTerms', searchDb.listSearchTerms, input, isListOcrLinesInput),
  listSearchPostings: (input) =>
    withDatabase('listSearchPostings', searchDb.listSearchPostings, input, isListOcrLinesInput),
  listChunkSources: (input) =>
    withDatabase('listChunkSources', searchDb.listChunkSources, input, isListOcrLinesInput),
}

const COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(COMMAND))
function isLibraryCommand(command: string): command is (typeof COMMAND)[keyof typeof COMMAND] {
  return COMMAND_LIST.has(command)
}

function executeLibraryCommand(request: StorageRequest): Promise<unknown> {
  switch (request.command) {
    case COMMAND.CLEAR_STORAGE:
      return clearStorage()
    case COMMAND.SAVE_BOOK:
      return saveBook(getPayload(request, request.command, isAddBookInput))
    case COMMAND.LIST_BOOKS:
      return listLibraryBooks()
    case COMMAND.GET_BOOK:
      return getBook(getBookId(request))
    case COMMAND.DELETE_BOOK:
      return deleteBook(getBookId(request))
    default:
      throw new UnsupportedCommandError(request.command)
  }
}

export async function executeCommand(request: StorageRequest): Promise<unknown> {
  if (isLibraryCommand(request.command)) return await executeLibraryCommand(request)
  if (isSqliteCommand(request.command)) return executeSqliteCommand(await getDatabase(), request)
  throw new UnsupportedCommandError(request.command)
}
