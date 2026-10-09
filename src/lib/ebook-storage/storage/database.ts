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
import {
  type StorageRequest,
  getPayload,
  getBookId,
  isUpdateProgressInput,
  isUpdateTitleInput,
  isUpdateCoverInput,
  isInitializeOcrPagesInput,
  isStoreOcrPageInput,
  isGetStoredOcrPageInput,
  isListOcrLinesInput,
  isStoreSearchIndexInput,
  isSearchChunkQuery,
} from './validation'
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
      return hasBook(database, getBookId(request))
    case SQLITE_COMMAND.UPDATE_PROGRESS:
      return updateProgress(database, getPayload(request, request.command, isUpdateProgressInput))
    case SQLITE_COMMAND.UPDATE_TITLE:
      return updateTitle(database, getPayload(request, request.command, isUpdateTitleInput))
    case SQLITE_COMMAND.UPDATE_COVER:
      return updateCover(database, getPayload(request, request.command, isUpdateCoverInput))
    case SQLITE_COMMAND.INITIALIZE_OCR_PAGES:
      return initializeOcrPages(
        database,
        getPayload(request, request.command, isInitializeOcrPagesInput),
      )
    case SQLITE_COMMAND.PREPARE_OCR_PAGES_FOR_RUN:
      return prepareOcrPagesForRun(database, getBookId(request))
    case SQLITE_COMMAND.ACQUIRE_NEXT_OCR_PAGE:
      return acquireNextOcrPage(database, getBookId(request))
    case SQLITE_COMMAND.STORE_OCR_PAGE:
      return storeOcrPage(database, getPayload(request, request.command, isStoreOcrPageInput))
    case SQLITE_COMMAND.FAIL_OCR_PAGE:
      return failOcrPage(database, getBookId(request))
    case SQLITE_COMMAND.FAIL_BOOK_ANALYSIS:
      return failBookAnalysis(database, getBookId(request))
    case SQLITE_COMMAND.RETRY_BOOK_ANALYSIS:
      return retryBookAnalysis(database, getBookId(request))
    case SQLITE_COMMAND.LIST_OCR_LINES:
      return listOcrLines(database, getPayload(request, request.command, isListOcrLinesInput))
    case SQLITE_COMMAND.GET_STORED_OCR_PAGE:
      return getStoredOcrPage(
        database,
        getPayload(request, request.command, isGetStoredOcrPageInput),
      )
    case SQLITE_COMMAND.LIST_OCR_PAGES:
      return listOcrPages(database, getBookId(request))
    case SQLITE_COMMAND.GET_BOOK_ANALYSIS_STATUS:
      return getBookAnalysisStatus(database, getBookId(request))
    case SQLITE_COMMAND.GET_OCR_LINES_FOR_CHUNKING:
      return getOcrLinesForChunking(database, getBookId(request))
    case SQLITE_COMMAND.STORE_SEARCH_INDEX:
      return storeSearchIndex(
        database,
        getPayload(request, request.command, isStoreSearchIndexInput),
      )
    case SQLITE_COMMAND.LIST_SEARCH_CHUNKS:
      return listSearchChunks(database, getPayload(request, request.command, isListOcrLinesInput))
    case SQLITE_COMMAND.LIST_CHUNK_SOURCES:
      return listChunkSources(database, getPayload(request, request.command, isListOcrLinesInput))
    case SQLITE_COMMAND.LIST_SEARCH_TERMS:
      return listSearchTerms(database, getPayload(request, request.command, isListOcrLinesInput))
    case SQLITE_COMMAND.LIST_SEARCH_POSTINGS:
      return listSearchPostings(database, getPayload(request, request.command, isListOcrLinesInput))
    case SQLITE_COMMAND.SEARCH_CHUNKS:
      return searchChunks(database, getPayload(request, request.command, isSearchChunkQuery))
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
