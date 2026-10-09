import { and, desc, eq, gte } from 'drizzle-orm'
import type { DatabaseConnection } from './database-connection'
import type { AddBookInput, BookAnalysisStatus } from '../types/book'
import type { UpdateCoverInput, UpdateProgressInput, UpdateTitleInput } from '../types/inputs'
import { books } from '../schema'
import { DeletedBookError, DuplicateBookError, NotFoundBookError } from './errors'
import { refreshSearchTerms } from './search'
import { isBookAnalysisStatus, normalizeStoredProgress } from './validation'

export function createBookRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function addBook(input: AddBookInput): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()
    // SQLocal의 tx.query로 실행해야 외부 쿼리가 트랜잭션에 끼어들지 않는다.
    return await sqlocal.transaction(async (tx) => {
      const [existing] = await tx.query(
        db
          .select({ id: books.id })
          .from(books)
          .where(eq(books.contentHash, input.contentHash))
          .limit(1),
      )
      if (existing) throw new DuplicateBookError()

      await tx.query(
        db.insert(books).values({
          id,
          contentHash: input.contentHash,
          fileName: input.fileName,
          title: input.title,
          author: input.author,
          pdfTitle: input.pdfTitle,
          pdfSubject: input.pdfSubject,
          pdfKeywords: input.pdfKeywords,
          publisher: input.publisher,
          pdfSize: input.pdfSize,
          pageCount: input.pageCount,
          coverData: input.coverData ? new Uint8Array(input.coverData) : null,
          coverMime: input.coverMime,
          coverStatus: input.coverStatus,
          lastPage: null,
          analysisStatus: 'analyzing',
          ocrCompletedAt: null,
          indexedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      )
      return id
    })
  }

  async function deleteBookById(id: string): Promise<void> {
    return await sqlocal.transaction(async (tx) => {
      const [deleted] = await tx.query(
        db.delete(books).where(eq(books.id, id)).returning({ id: books.id }),
      )
      if (!deleted) throw new DeletedBookError()

      await refreshSearchTerms(db, tx)
    })
  }

  async function listBooks() {
    const rows = await db
      .select({
        id: books.id,
        content_hash: books.contentHash,
        file_name: books.fileName,
        title: books.title,
        author: books.author,
        pdf_title: books.pdfTitle,
        pdf_subject: books.pdfSubject,
        pdf_keywords: books.pdfKeywords,
        publisher: books.publisher,
        pdf_size: books.pdfSize,
        page_count: books.pageCount,
        cover_data: books.coverData,
        cover_mime: books.coverMime,
        cover_status: books.coverStatus,
        last_page: books.lastPage,
        analysis_status: books.analysisStatus,
        ocr_completed_at: books.ocrCompletedAt,
        indexed_at: books.indexedAt,
        created_at: books.createdAt,
        updated_at: books.updatedAt,
      })
      .from(books)
      .orderBy(desc(books.createdAt), desc(books.id))
    return rows.map((book) => {
      const { id } = book
      if (id === null) throw new Error('Invalid book ID')
      if (!isBookAnalysisStatus(book.analysis_status))
        throw new Error('Invalid book analysis status')
      if (book.cover_status !== 'ready' && book.cover_status !== 'fallback')
        throw new Error('Invalid cover status')
      for (const timestamp of [book.ocr_completed_at, book.indexed_at]) {
        if (timestamp !== null && !Number.isSafeInteger(timestamp))
          throw new Error('Invalid analysis timestamp')
      }
      return { ...book, id }
    })
  }

  async function hasBook(id: string): Promise<void> {
    const [book] = await db.select({ id: books.id }).from(books).where(eq(books.id, id))
    if (!book) throw new DeletedBookError()
  }

  async function getBookMetadata(id: string) {
    const [book] = await db
      .select({
        id: books.id,
        content_hash: books.contentHash,
        file_name: books.fileName,
        title: books.title,
        author: books.author,
        pdf_title: books.pdfTitle,
        pdf_subject: books.pdfSubject,
        pdf_keywords: books.pdfKeywords,
        publisher: books.publisher,
        pdf_size: books.pdfSize,
        page_count: books.pageCount,
        last_page: books.lastPage,
        analysis_status: books.analysisStatus,
      })
      .from(books)
      .where(eq(books.id, id))
    if (!book) throw new NotFoundBookError()
    if (book.id === null) throw new Error('Invalid book ID')
    if (!isBookAnalysisStatus(book.analysis_status)) throw new Error('Invalid book analysis status')
    return await normalizeStoredProgress(database, id, { ...book, id: book.id })
  }

  async function updateProgress(input: UpdateProgressInput): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ lastPage: input.page, updatedAt: Date.now() })
      .where(and(eq(books.id, input.id), gte(books.pageCount, input.page)))
      .returning({ id: books.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateTitle(input: UpdateTitleInput): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({ title: input.title.trim(), updatedAt: Date.now() })
      .where(eq(books.id, input.id))
      .returning({ id: books.id })
    if (!updated) throw new DeletedBookError()
  }

  async function updateCover(input: UpdateCoverInput): Promise<void> {
    const [updated] = await db
      .update(books)
      .set({
        coverData: new Uint8Array(input.coverData),
        coverMime: input.coverMime,
        coverStatus: 'ready',
        updatedAt: Date.now(),
      })
      .where(eq(books.id, input.id))
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
    const [result] = await db
      .select({ analysis_status: books.analysisStatus })
      .from(books)
      .where(eq(books.id, bookId))
    if (result?.analysis_status === 'analyzing') return result.analysis_status
    if (result?.analysis_status === 'ready') return result.analysis_status
    if (result?.analysis_status === 'failed') return result.analysis_status
    if (!result) throw new NotFoundBookError()
    throw new Error('Invalid book analysis status')
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
