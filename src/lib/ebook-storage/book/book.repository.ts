import type { DatabaseConnection } from '../database-connection'
import type { Book, BookAnalysisStatus, BookCover, BookProgress, BookTitle } from '../types/book'
import { and, desc, eq, gte } from 'drizzle-orm'
import { books } from '../schema'
import { DeletedBookError, DuplicateBookError, NotFoundBookError } from '../storage-errors'
import { refreshSearchTerms } from '../search/search.repository'
import { isBookAnalysisStatus, normalizeStoredProgress } from '../validation'

export function createBookRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function addBook(book: Book): Promise<string> {
    const [inserted] = await db
      .insert(books)
      .values(book)
      .onConflictDoNothing({ target: books.contentHash })
      .returning({ id: books.id })
    if (!inserted) throw new DuplicateBookError()
    return book.id
  }

  async function deleteBookById(bookId: string): Promise<void> {
    return await sqlocal.transaction(async (tx) => {
      const [deleted] = await tx.query(
        db.delete(books).where(eq(books.id, bookId)).returning({ id: books.id }),
      )
      if (!deleted) throw new DeletedBookError()

      await refreshSearchTerms(db, tx)
    })
  }

  async function listBooks(): Promise<Book[]> {
    const rows = await db.query.books.findMany({
      orderBy: [desc(books.createdAt), desc(books.id)],
    })
    return rows.map((book) => {
      const { id } = book
      if (id === null) throw new Error('Invalid book ID')
      if (!isBookAnalysisStatus(book.analysisStatus))
        throw new Error('Invalid book analysis status')
      if (book.coverStatus !== 'ready' && book.coverStatus !== 'fallback')
        throw new Error('Invalid cover status')
      for (const timestamp of [book.ocrCompletedAt, book.indexedAt]) {
        if (timestamp !== null && !Number.isSafeInteger(timestamp))
          throw new Error('Invalid analysis timestamp')
      }
      return { ...book, id }
    })
  }

  async function hasBook(bookId: string): Promise<void> {
    const book = await db.query.books.findFirst({
      columns: { id: true },
      where: eq(books.id, bookId),
    })
    if (!book) throw new DeletedBookError()
  }

  async function getBookMetadata(bookId: string) {
    const book = await db.query.books.findFirst({
      columns: {
        coverData: false,
        coverMime: false,
        coverStatus: false,
        ocrCompletedAt: false,
        indexedAt: false,
        createdAt: false,
        updatedAt: false,
      },
      where: eq(books.id, bookId),
    })
    if (!book) throw new NotFoundBookError()
    if (book.id === null) throw new Error('Invalid book ID')
    if (!isBookAnalysisStatus(book.analysisStatus)) throw new Error('Invalid book analysis status')
    return await normalizeStoredProgress(database, bookId, { ...book, id: book.id })
  }

  async function updateProgress(bookProgress: BookProgress): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ lastPage: bookProgress.page, updatedAt: Date.now() })
      .where(and(eq(books.id, bookProgress.id), gte(books.pageCount, bookProgress.page)))
      .returning({ id: books.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateTitle(bookTitle: BookTitle): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ title: bookTitle.title.trim(), updatedAt: Date.now() })
      .where(eq(books.id, bookTitle.id))
      .returning({ id: books.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateCover(bookCover: BookCover): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({
        coverData: new Uint8Array(bookCover.coverData),
        coverMime: bookCover.coverMime,
        coverStatus: 'ready',
        updatedAt: Date.now(),
      })
      .where(eq(books.id, bookCover.id))
      .returning({ id: books.id })
    if (!updated) throw new DeletedBookError()
  }

  async function failBookAnalysis(bookId: string): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ analysisStatus: 'failed', updatedAt: Date.now() })
      .where(eq(books.id, bookId))
      .returning({ id: books.id })
    if (!updated) throw new NotFoundBookError()
  }

  async function getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus> {
    const result = await db.query.books.findFirst({
      columns: { analysisStatus: true },
      where: eq(books.id, bookId),
    })
    if (!result) throw new NotFoundBookError()
    if (!isBookAnalysisStatus(result.analysisStatus))
      throw new Error('Invalid book analysis status')
    return result.analysisStatus
  }

  async function retryBookAnalysis(bookId: string): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ analysisStatus: 'analyzing', updatedAt: Date.now() })
      .where(and(eq(books.id, bookId), eq(books.analysisStatus, 'failed')))
      .returning({ id: books.id })
    if (!updated) throw new NotFoundBookError()
  }

  return {
    addBook,
    deleteBookById,
    listBooks,
    hasBook,
    getBookMetadata,
    updateProgress,
    updateTitle,
    updateCover,
    failBookAnalysis,
    getBookAnalysisStatus,
    retryBookAnalysis,
  }
}
