import type { Book, BookAnalysisStatus, BookCover, BookDocument, InsertBook } from '../types/book'

export interface BookRepository {
  addBook(book: InsertBook): Promise<string>
  getBookDetails(bookId: string): Promise<Omit<BookDocument, 'pdfData'>>
  deleteBookById(bookId: string): Promise<void>
  listBooks(): Promise<Book[]>
  hasBook(bookId: string): Promise<void>
  updateProgress(input: { bookId: string; page: number }): Promise<void>
  updateTitle(input: { bookId: string; title: string }): Promise<void>
  updateCover(input: { bookId: string; cover: BookCover }): Promise<void>
  failBookAnalysis(bookId: string): Promise<void>
  getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus>
  retryBookAnalysis(bookId: string): Promise<void>
}
