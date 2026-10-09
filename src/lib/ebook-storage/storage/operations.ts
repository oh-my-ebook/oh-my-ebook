import type { EbookStore } from '../ebook-store'
import type { AddBookInput, StoredBook, StoredBookDetail } from '../data/book'
import * as database from './database-connection'
import { clearPdfFiles, deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import { createBookRepository } from './books'
import { createOcrRepository } from './ocr'
import { createSearchRepository } from './search'
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

const bookRepository = createBookRepository(database)
const ocrRepository = createOcrRepository(database)
const searchRepository = createSearchRepository(database)

/**
 * SQLite에 메타 데이터를 먼저 저장한 후, 콘텐츠 해시를 기준으로 OPFS에 PDF 파일 저장
 * 만약 OPFS 저장에 실패하면 SQLite에 저장한 메타 데이터를 삭제
 */
async function saveBook(input: AddBookInput): Promise<string> {
  validateInput(input, 'saveBook', isAddBookInput)
  const id = await bookRepository.addBook(input)

  try {
    await writePdf(input.contentHash, input.pdfData)
    return id
  } catch (error) {
    try {
      await bookRepository.deleteBookById(id)
    } catch {
      console.error('Failed to delete book from SQLite', { id })
    }
    throw error
  }
}

async function getBook(id: string): Promise<StoredBookDetail> {
  validateInput(id, 'bookId', isIdentifier)
  const book = await bookRepository.getBookMetadata(id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  return { ...book, pdf_data: await readPdf(contentHash) }
}

async function listLibraryBooks(): Promise<StoredBook[]> {
  const books = await bookRepository.listBooks()

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
  const book = await bookRepository.getBookMetadata(id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  await deletePdf(contentHash)
  await bookRepository.deleteBookById(id)
}

async function clearStorage(): Promise<void> {
  await database.resetDatabase()
  await clearPdfFiles()
}

async function runValidated<Input, Result>(
  name: keyof EbookStore,
  operation: (input: Input) => Promise<Result>,
  input: Input,
  isValid: (value: unknown) => value is Input,
): Promise<Result> {
  validateInput(input, name, isValid)
  return await operation(input)
}

export const storeOperations: EbookStore = {
  async initialize() {
    await database.initializeDatabase()
  },
  clearStorage,
  saveBook,
  getBook,
  deleteBook,
  listBooks: listLibraryBooks,
  hasBook: (id) => runValidated('hasBook', bookRepository.hasBook, id, isIdentifier),
  updateProgress: (input) =>
    runValidated('updateProgress', bookRepository.updateProgress, input, isUpdateProgressInput),
  updateTitle: (input) =>
    runValidated('updateTitle', bookRepository.updateTitle, input, isUpdateTitleInput),
  updateCover: (input) =>
    runValidated('updateCover', bookRepository.updateCover, input, isUpdateCoverInput),
  initializeOcrPages: (input) =>
    runValidated(
      'initializeOcrPages',
      ocrRepository.initializeOcrPages,
      input,
      isInitializeOcrPagesInput,
    ),
  prepareOcrPagesForRun: (bookId) =>
    runValidated(
      'prepareOcrPagesForRun',
      ocrRepository.prepareOcrPagesForRun,
      bookId,
      isIdentifier,
    ),
  acquireNextOcrPage: (bookId) =>
    runValidated('acquireNextOcrPage', ocrRepository.acquireNextOcrPage, bookId, isIdentifier),
  storeOcrPage: (input) =>
    runValidated('storeOcrPage', ocrRepository.storeOcrPage, input, isStoreOcrPageInput),
  failOcrPage: (pageId) =>
    runValidated('failOcrPage', ocrRepository.failOcrPage, pageId, isIdentifier),
  failBookAnalysis: (bookId) =>
    runValidated('failBookAnalysis', bookRepository.failBookAnalysis, bookId, isIdentifier),
  getBookAnalysisStatus: (bookId) =>
    runValidated(
      'getBookAnalysisStatus',
      bookRepository.getBookAnalysisStatus,
      bookId,
      isIdentifier,
    ),
  retryBookAnalysis: (bookId) =>
    runValidated('retryBookAnalysis', bookRepository.retryBookAnalysis, bookId, isIdentifier),
  getStoredOcrPage: (input) =>
    runValidated(
      'getStoredOcrPage',
      ocrRepository.getStoredOcrPage,
      input,
      isGetStoredOcrPageInput,
    ),
  listOcrPages: (bookId) =>
    runValidated('listOcrPages', ocrRepository.listOcrPages, bookId, isIdentifier),
  listOcrLines: (input) =>
    runValidated('listOcrLines', ocrRepository.listOcrLines, input, isListOcrLinesInput),
  getOcrLinesForChunking: (bookId) =>
    runValidated(
      'getOcrLinesForChunking',
      ocrRepository.getOcrLinesForChunking,
      bookId,
      isIdentifier,
    ),
  storeSearchIndex: (input) =>
    runValidated(
      'storeSearchIndex',
      searchRepository.storeSearchIndex,
      input,
      isStoreSearchIndexInput,
    ),
  listSearchChunks: (input) =>
    runValidated('listSearchChunks', searchRepository.listSearchChunks, input, isListOcrLinesInput),
  searchChunks: (query) =>
    runValidated('searchChunks', searchRepository.searchChunks, query, isSearchChunkQuery),
  listSearchTerms: (input) =>
    runValidated('listSearchTerms', searchRepository.listSearchTerms, input, isListOcrLinesInput),
  listSearchPostings: (input) =>
    runValidated(
      'listSearchPostings',
      searchRepository.listSearchPostings,
      input,
      isListOcrLinesInput,
    ),
  listChunkSources: (input) =>
    runValidated('listChunkSources', searchRepository.listChunkSources, input, isListOcrLinesInput),
}
