import type {
  BookCover,
  BookProgress,
  BookTitle,
  ImportedBook,
  Book,
  StoredBook,
  StoredBookDetail,
  BookAnalysisStatus,
} from '../types/book'
import type { createBookRepository } from './book.repository'
import { deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import {
  isImportedBook,
  isContentHash,
  isIdentifier,
  isBookCover,
  isBookProgress,
  isBookTitle,
  runValidated,
  validateData,
} from '../validation'

export interface BookService {
  saveBook(book: ImportedBook): Promise<string>
  getBook(bookId: string): Promise<StoredBookDetail>
  deleteBook(bookId: string): Promise<void>
  listBooks(): Promise<StoredBook[]>
  hasBook(bookId: string): Promise<void>
  updateProgress(bookProgress: BookProgress): Promise<void>
  updateTitle(bookTitle: BookTitle): Promise<void>
  updateCover(bookCover: BookCover): Promise<void>
  failBookAnalysis(bookId: string): Promise<void>
  getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus>
  retryBookAnalysis(bookId: string): Promise<void>
}

export function createBookService(
  bookRepository: ReturnType<typeof createBookRepository>,
): BookService {
  /**
   * SQLite에 메타 데이터를 먼저 저장한 후, 콘텐츠 해시를 기준으로 OPFS에 PDF 파일 저장
   * 만약 OPFS 저장에 실패하면 SQLite에 저장한 메타 데이터를 삭제
   */
  async function saveBook(book: ImportedBook): Promise<string> {
    validateData(book, 'saveBook', isImportedBook)
    const { pdfData, coverData, ...metadata } = book
    const now = Date.now()
    const newBook: Book = {
      ...metadata,
      id: crypto.randomUUID(),
      coverData: coverData ? new Uint8Array(coverData) : null,
      lastPage: null,
      analysisStatus: 'analyzing',
      ocrCompletedAt: null,
      indexedAt: null,
      createdAt: now,
      updatedAt: now,
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

  async function getBook(bookId: string): Promise<StoredBookDetail> {
    validateData(bookId, 'bookId', isIdentifier)
    const book = await bookRepository.getBookMetadata(bookId)
    const contentHash = book.contentHash
    if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

    return { ...book, pdfData: await readPdf(contentHash) }
  }

  async function listLibraryBooks(): Promise<StoredBook[]> {
    const books = await bookRepository.listBooks()

    return await Promise.all(
      books.map(async (book) => {
        if (!isContentHash(book.contentHash)) throw new Error('Invalid content hash')

        return { ...book, pdfStatus: (await hasPdf(book.contentHash)) ? 'available' : 'missing' }
      }),
    )
  }

  /**
   * OPFS에 저장된 PDF 파일을 삭제한 후, SQLite에 저장된 메타 데이터를 삭제
   * 만약 OPFS 삭제에 실패하면 Error를 발생
   */
  async function deleteBook(bookId: string): Promise<void> {
    validateData(bookId, 'bookId', isIdentifier)
    const book = await bookRepository.getBookMetadata(bookId)
    const contentHash = book.contentHash
    if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

    await deletePdf(contentHash)
    await bookRepository.deleteBookById(bookId)
  }

  return {
    saveBook,
    getBook,
    deleteBook,
    listBooks: listLibraryBooks,
    hasBook: (bookId) => runValidated('hasBook', bookRepository.hasBook, bookId, isIdentifier),
    updateProgress: (bookProgress) =>
      runValidated('updateProgress', bookRepository.updateProgress, bookProgress, isBookProgress),
    updateTitle: (bookTitle) =>
      runValidated('updateTitle', bookRepository.updateTitle, bookTitle, isBookTitle),
    updateCover: (bookCover) =>
      runValidated('updateCover', bookRepository.updateCover, bookCover, isBookCover),
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
}
