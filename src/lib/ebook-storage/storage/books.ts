import { and, desc, eq, gte } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import type { AddBookInput, BookAnalysisStatus } from '../data/book'
import { books } from '../schema'
import { DeletedBookError, DuplicateBookError, NotFoundBookError } from './errors'
import { refreshSearchTerms } from './search'
import {
  getBookId,
  getPayload,
  isUpdateCoverInput,
  isUpdateProgressInput,
  isUpdateTitleInput,
  normalizeStoredProgress,
  type StorageRequest,
} from './validation'

export async function addBook(database: SQLocalDrizzle, input: AddBookInput): Promise<string> {
  const db = drizzle(database.driver)
  const id = crypto.randomUUID()
  const now = Date.now()
  // SQLocal의 tx.query로 실행해야 외부 쿼리가 트랜잭션에 끼어들지 않는다.
  return await database.transaction(async (tx) => {
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

export async function deleteBookById(database: SQLocalDrizzle, id: string): Promise<void> {
  const db = drizzle(database.driver)
  return await database.transaction(async (tx) => {
    const [deleted] = await tx.query(
      db.delete(books).where(eq(books.id, id)).returning({ id: books.id }),
    )
    if (!deleted) throw new DeletedBookError()

    await refreshSearchTerms(db, tx)
  })
}

export async function listBooks(database: SQLocalDrizzle) {
  return await drizzle(database.driver)
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
}

export async function hasBook(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const id = getBookId(request)
  const [book] = await drizzle(database.driver)
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, id))
  if (!book) throw new DeletedBookError()
}

export async function getBookMetadata(
  database: SQLocalDrizzle,
  id: string,
): Promise<Record<string, unknown>> {
  const [book] = await drizzle(database.driver)
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
  return await normalizeStoredProgress(database, id, book)
}

export async function updateProgress(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const input = getPayload(request, request.command, isUpdateProgressInput)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ lastPage: input.page, updatedAt: Date.now() })
    .where(and(eq(books.id, input.id), gte(books.pageCount, input.page)))
    .returning({ id: books.id })
  if (!updated) throw new DeletedBookError()
}

export async function updateTitle(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const input = getPayload(request, request.command, isUpdateTitleInput)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ title: input.title.trim(), updatedAt: Date.now() })
    .where(eq(books.id, input.id))
    .returning({ id: books.id })
  if (!updated) throw new DeletedBookError()
}

export async function updateCover(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const input = getPayload(request, request.command, isUpdateCoverInput)
  const [updated] = await drizzle(database.driver)
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

export async function failBookAnalysis(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const bookId = getBookId(request)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ analysisStatus: 'failed', updatedAt: Date.now() })
    .where(eq(books.id, bookId))
    .returning({ id: books.id })
  if (!updated) throw new NotFoundBookError()
}

export async function getBookAnalysisStatus(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<BookAnalysisStatus> {
  const bookId = getBookId(request)
  const [result] = await drizzle(database.driver)
    .select({ analysis_status: books.analysisStatus })
    .from(books)
    .where(eq(books.id, bookId))
  if (result?.analysis_status === 'analyzing') return result.analysis_status
  if (result?.analysis_status === 'ready') return result.analysis_status
  if (result?.analysis_status === 'failed') return result.analysis_status
  if (!result) throw new NotFoundBookError()
  throw new Error('Invalid book analysis status')
}

export async function retryBookAnalysis(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const bookId = getBookId(request)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ analysisStatus: 'analyzing', updatedAt: Date.now() })
    .where(and(eq(books.id, bookId), eq(books.analysisStatus, 'failed')))
    .returning({ id: books.id })
  if (!updated) throw new NotFoundBookError()
}
