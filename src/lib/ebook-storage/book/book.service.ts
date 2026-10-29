import type {
  BookFileData,
  InsertBook,
  BookListItem,
  BookDocument,
  BookAnalysisStatus,
  BookCover,
} from '../types/book'
import type { createBookRepository } from './book.repository'
import { deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import {
  isBookFileData,
  isContentHash,
  isIdentifier,
  runValidated,
  validateData,
} from '../validation'
import { InvalidDataError } from '../storage-errors'

export interface BookService {
  saveBook(book: BookFileData): Promise<string>
  getBook(bookId: string): Promise<BookDocument>
  deleteBook(bookId: string): Promise<void>
  listBooks(): Promise<BookListItem[]>
  hasBook(bookId: string): Promise<void>
  updateProgress({ bookId, page }: { bookId: string; page: number }): Promise<void>
  updateTitle({ bookId, title }: { bookId: string; title: string }): Promise<void>
  updateCover({ bookId, cover }: { bookId: string; cover: BookCover }): Promise<void>
  failBookAnalysis(bookId: string): Promise<void>
  getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus>
  retryBookAnalysis(bookId: string): Promise<void>
}

export function createBookService(
  bookRepository: ReturnType<typeof createBookRepository>,
): BookService {
  /**
   * SQLite에 책 정보를 먼저 저장한 후, 콘텐츠 해시를 기준으로 OPFS에 PDF 파일 저장
   * 만약 OPFS 저장에 실패하면 SQLite에 저장한 책 정보를 삭제
   */
  async function saveBook(book: BookFileData): Promise<string> {
    validateData(book, 'saveBook', isBookFileData)
    const { pdfData, coverData, ...fields } = book
    const newBook: InsertBook = {
      ...fields,
      id: crypto.randomUUID(),
      coverData: coverData ? new Uint8Array(coverData) : null,
      lastPage: null,
      analysisStatus: 'analyzing',
      ocrCompletedAt: null,
      indexedAt: null,
    }
    const id = await bookRepository.addBook(newBook)

    try {
      await writePdf(book.contentHash, pdfData)
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

  async function getBook(bookId: string): Promise<BookDocument> {
    validateData(bookId, 'bookId', isIdentifier)
    const book = await bookRepository.getBookDetails(bookId)
    const contentHash = book.contentHash
    if (!isContentHash(contentHash)) throw new Error('Invalid content hash')
    const pdfData = await readPdf(contentHash)

    return { ...book, pdfData }
  }

  async function listLibraryBooks(): Promise<BookListItem[]> {
    const books = await bookRepository.listBooks()

    const libraryBooks = await Promise.all(
      books.map(async (book) => {
        if (!isContentHash(book.contentHash)) throw new Error('Invalid content hash')
        const hasPdfFile = await hasPdf(book.contentHash)

        const listItem: BookListItem = {
          ...book,
          pdfStatus: hasPdfFile ? 'available' : 'missing',
        }
        return listItem
      }),
    )
    return libraryBooks
  }

  /**
   * OPFS에 저장된 PDF 파일을 삭제한 후, SQLite에 저장된 책 정보를 삭제
   * 만약 OPFS 삭제에 실패하면 Error를 발생
   */
  async function deleteBook(bookId: string): Promise<void> {
    validateData(bookId, 'bookId', isIdentifier)
    const book = await bookRepository.getBookDetails(bookId)
    const contentHash = book.contentHash
    if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

    await deletePdf(contentHash)
    await bookRepository.deleteBookById(bookId)
  }

  const service: BookService = {
    saveBook,
    getBook,
    deleteBook,
    listBooks: listLibraryBooks,
    hasBook: (bookId) => runValidated('hasBook', bookRepository.hasBook, bookId, isIdentifier),
    updateProgress: async ({ bookId, page }) => {
      if (!Number.isSafeInteger(page) || page <= 0) {
        throw new InvalidDataError('updateProgress')
      }

      await bookRepository.updateProgress({ bookId, page })
    },

    updateTitle: async ({ bookId, title }) => {
      if (title.trim().length === 0) {
        throw new InvalidDataError('updateTitle')
      }

      await bookRepository.updateTitle({ bookId, title })
    },
    updateCover: ({ bookId, cover }) => bookRepository.updateCover({ bookId, cover }),
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
  }
  return service
}
