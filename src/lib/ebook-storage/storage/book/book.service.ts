import type { EbookStore } from '../../ebook-store'
import type { createBookRepository } from './book.repository'
import type { AddBookInput, StoredBook, StoredBookDetail } from '../../types/book'
import { deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'
import {
  isAddBookInput,
  isContentHash,
  isIdentifier,
  isUpdateCoverInput,
  isUpdateProgressInput,
  isUpdateTitleInput,
  runValidated,
  validateInput,
} from '../validation'

type BookService = Pick<
  EbookStore,
  | 'saveBook'
  | 'getBook'
  | 'deleteBook'
  | 'listBooks'
  | 'hasBook'
  | 'updateProgress'
  | 'updateTitle'
  | 'updateCover'
  | 'failBookAnalysis'
  | 'getBookAnalysisStatus'
  | 'retryBookAnalysis'
>

export function createBookService(
  bookRepository: ReturnType<typeof createBookRepository>,
): BookService {
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

  return {
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
