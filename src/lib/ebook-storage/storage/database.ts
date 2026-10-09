import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import { SQLITE_COMMAND } from '../commands'
import {
  failBookAnalysis,
  getBookAnalysisStatus,
  hasBook,
  retryBookAnalysis,
  updateCover,
  updateProgress,
  updateTitle,
} from './books'
import { UnsupportedCommandError } from './errors'
import {
  acquireNextOcrPage,
  failOcrPage,
  getOcrLinesForChunking,
  getStoredOcrPage,
  initializeOcrPages,
  listOcrLines,
  listOcrPages,
  prepareOcrPagesForRun,
  storeOcrPage,
} from './ocr'
import {
  listChunkSources,
  listSearchChunks,
  listSearchPostings,
  listSearchTerms,
  searchChunks,
  storeSearchIndex,
} from './search'
import { type StorageRequest } from './validation'
export { addBook, deleteBookById, getBookMetadata, listBooks } from './books'
export { getBookId } from './validation'

type SqliteCommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]

const SQLITE_COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(SQLITE_COMMAND))

export function isSqliteCommand(command: string): command is SqliteCommand {
  return SQLITE_COMMAND_LIST.has(command)
}

export async function executeSqliteCommand(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<unknown> {
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
    case SQLITE_COMMAND.PREPARE_OCR_PAGES_FOR_RUN:
      return prepareOcrPagesForRun(database, request)
    case SQLITE_COMMAND.ACQUIRE_NEXT_OCR_PAGE:
      return acquireNextOcrPage(database, request)
    case SQLITE_COMMAND.STORE_OCR_PAGE:
      return storeOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_OCR_PAGE:
      return failOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_BOOK_ANALYSIS:
      return failBookAnalysis(database, request)
    case SQLITE_COMMAND.RETRY_BOOK_ANALYSIS:
      return retryBookAnalysis(database, request)
    case SQLITE_COMMAND.LIST_OCR_LINES:
      return listOcrLines(database, request)
    case SQLITE_COMMAND.GET_STORED_OCR_PAGE:
      return getStoredOcrPage(database, request)
    case SQLITE_COMMAND.LIST_OCR_PAGES:
      return listOcrPages(database, request)
    case SQLITE_COMMAND.GET_BOOK_ANALYSIS_STATUS:
      return getBookAnalysisStatus(database, request)
    case SQLITE_COMMAND.GET_OCR_LINES_FOR_CHUNKING:
      return getOcrLinesForChunking(database, request)
    case SQLITE_COMMAND.STORE_SEARCH_INDEX:
      return storeSearchIndex(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_CHUNKS:
      return listSearchChunks(database, request)
    case SQLITE_COMMAND.LIST_CHUNK_SOURCES:
      return listChunkSources(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_TERMS:
      return listSearchTerms(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_POSTINGS:
      return listSearchPostings(database, request)
    case SQLITE_COMMAND.SEARCH_CHUNKS:
      return searchChunks(database, request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
