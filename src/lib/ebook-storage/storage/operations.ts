import { closeDatabase, getDatabase } from './database-connection'
import { COMMAND } from '../commands'
import { UnsupportedCommandError } from './errors'
import { clearOpfs, deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import {
  addBook,
  deleteBookById,
  executeSqliteCommand,
  getBookMetadata,
  isSqliteCommand,
  getBookId,
  listBooks,
} from './database'
import {
  getPayload,
  isAddBookInput,
  isBook,
  isContentHash,
  type StorageRequest,
} from './validation'

const COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(COMMAND))
function isLibraryCommand(command: string): command is (typeof COMMAND)[keyof typeof COMMAND] {
  return COMMAND_LIST.has(command)
}

/**
 * SQLite에 메타 데이터를 먼저 저장한 후, 콘텐츠 해시를 기준으로 OPFS에 PDF 파일 저장
 * 만약 OPFS 저장에 실패하면 SQLite에 저장한 메타 데이터를 삭제
 */
async function saveBook(request: StorageRequest): Promise<string> {
  const input = getPayload(request, request.command, isAddBookInput)
  const database = await getDatabase()
  const id = await addBook(database, input)

  try {
    await writePdf(input.contentHash, input.pdfData)
    return id
  } catch (error) {
    try {
      await deleteBookById(database, id)
    } catch {
      console.error('Failed to delete book from SQLite', { id })
    }
    throw error
  }
}

async function getBook(request: StorageRequest): Promise<Record<string, unknown>> {
  const id = getBookId(request)
  const book = await getBookMetadata(await getDatabase(), id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  return { ...book, pdf_data: await readPdf(contentHash) }
}

async function listLibraryBooks(): Promise<Record<string, unknown>[]> {
  const books = await listBooks(await getDatabase())
  if (!Array.isArray(books)) throw new Error('Invalid book list')

  return await Promise.all(
    books.map(async (book) => {
      if (!isBook(book)) throw new Error('Invalid book list')

      return { ...book, pdf_status: (await hasPdf(book.content_hash)) ? 'available' : 'missing' }
    }),
  )
}

/**
 * OPFS에 저장된 PDF 파일을 삭제한 후, SQLite에 저장된 메타 데이터를 삭제
 * 만약 OPFS 삭제에 실패하면 Error를 발생
 */
async function deleteBook(request: StorageRequest): Promise<void> {
  const id = getBookId(request)
  const database = await getDatabase()
  const book = await getBookMetadata(database, id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  await deletePdf(contentHash)
  await deleteBookById(database, id)
}

async function clearStorage(): Promise<void> {
  await closeDatabase()
  await clearOpfs()
}

function executeLibraryCommand(request: StorageRequest): Promise<unknown> {
  switch (request.command) {
    case COMMAND.CLEAR_STORAGE:
      return clearStorage()
    case COMMAND.SAVE_BOOK:
      return saveBook(request)
    case COMMAND.LIST_BOOKS:
      return listLibraryBooks()
    case COMMAND.GET_BOOK:
      return getBook(request)
    case COMMAND.DELETE_BOOK:
      return deleteBook(request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}

export async function executeCommand(request: StorageRequest): Promise<unknown> {
  if (isLibraryCommand(request.command)) return await executeLibraryCommand(request)
  if (isSqliteCommand(request.command)) return executeSqliteCommand(await getDatabase(), request)
  throw new UnsupportedCommandError(request.command)
}
