import type { DatabaseConnection } from '../database-connection'
import type { Book, InsertBook, BookAnalysisStatus, BookCover } from '../types/book'
import { and, eq, gte } from 'drizzle-orm'
import { booksTable } from '../schema'
import { bookDetailsColumns } from '../schema/book'
import { DeletedBookError, DuplicateBookError, NotFoundBookError } from '../storage-errors'
import { deleteUnusedSearchTerms, recalculateTermFrequencies } from '../search/search.repository'
import { isBookAnalysisStatus } from '../validation'

export function createBookRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function addBook(book: InsertBook): Promise<string> {
    const [inserted] = await db
      .insert(booksTable)
      .values(book)
      .onConflictDoNothing({ target: booksTable.contentHash })
      .returning({ id: booksTable.id })
    if (!inserted) throw new DuplicateBookError()
    return book.id
  }

  async function deleteBookById(bookId: string): Promise<void> {
    await sqlocal.transaction(async (tx) => {
      const deleteBookQuery = db
        .delete(booksTable)
        .where(eq(booksTable.id, bookId))
        .returning({ id: booksTable.id })
      const [deletedBook] = await tx.query(deleteBookQuery)
      if (!deletedBook) throw new DeletedBookError()

      await deleteUnusedSearchTerms(db, tx)
      await recalculateTermFrequencies(db, tx)
    })
  }

  async function listBooks(): Promise<Book[]> {
    const rows = await db.query.booksTable.findMany({
      orderBy: { createdAt: 'desc', id: 'desc' },
    })
    const validatedBooks = rows.map((book) => {
      if (!isBookAnalysisStatus(book.analysisStatus))
        throw new Error('Invalid book analysis status')
      for (const timestamp of [book.ocrCompletedAt, book.indexedAt]) {
        if (timestamp !== null && !Number.isSafeInteger(timestamp))
          throw new Error('Invalid analysis timestamp')
      }
      return book
    })
    return validatedBooks
  }

  async function hasBook(bookId: string): Promise<void> {
    const book = await db.query.booksTable.findFirst({
      columns: { id: true },
      where: { id: bookId },
    })
    if (!book) throw new DeletedBookError()
  }

  async function getBookDetails(bookId: string) {
    const [book] = await db
      .select(bookDetailsColumns)
      .from(booksTable)
      .where(eq(booksTable.id, bookId))
      .limit(1)
    if (!book) throw new NotFoundBookError()
    if (!isBookAnalysisStatus(book.analysisStatus)) throw new Error('Invalid book analysis status')
    return book
  }

  async function updateProgress({ bookId, page }: { bookId: string; page: number }): Promise<void> {
    const [updated] = await db
      .update(booksTable)
      .set({ lastPage: page })
      .where(and(eq(booksTable.id, bookId), gte(booksTable.pageCount, page)))
      .returning({ id: booksTable.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateTitle({ bookId, title }: { bookId: string; title: string }): Promise<void> {
    const [updated] = await db
      .update(booksTable)
      .set({ title: title.trim() })
      .where(eq(booksTable.id, bookId))
      .returning({ id: booksTable.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateCover({
    bookId,
    cover,
  }: {
    bookId: string
    cover: BookCover
  }): Promise<void> {
    const { coverData, coverMime } = cover
    const [updated] = await db
      .update(booksTable)
      .set({
        coverData: new Uint8Array(coverData),
        coverMime: coverMime,
      })
      .where(eq(booksTable.id, bookId))
      .returning({ id: booksTable.id })
    if (!updated) throw new DeletedBookError()
  }

  async function failBookAnalysis(bookId: string): Promise<void> {
    const [updated] = await db
      .update(booksTable)
      .set({ analysisStatus: 'failed' })
      .where(eq(booksTable.id, bookId))
      .returning({ id: booksTable.id })
    if (!updated) throw new NotFoundBookError()
  }

  async function getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus> {
    const result = await db.query.booksTable.findFirst({
      columns: { analysisStatus: true },
      where: { id: bookId },
    })
    if (!result) throw new NotFoundBookError()
    if (!isBookAnalysisStatus(result.analysisStatus))
      throw new Error('Invalid book analysis status')
    return result.analysisStatus
  }

  async function retryBookAnalysis(bookId: string): Promise<void> {
    const [updated] = await db
      .update(booksTable)
      .set({ analysisStatus: 'analyzing' })
      .where(and(eq(booksTable.id, bookId), eq(booksTable.analysisStatus, 'failed')))
      .returning({ id: booksTable.id })
    if (!updated) throw new NotFoundBookError()
  }

  return {
    addBook,
    deleteBookById,
    listBooks,
    hasBook,
    getBookDetails,
    updateProgress,
    updateTitle,
    updateCover,
    failBookAnalysis,
    getBookAnalysisStatus,
    retryBookAnalysis,
  }
}
