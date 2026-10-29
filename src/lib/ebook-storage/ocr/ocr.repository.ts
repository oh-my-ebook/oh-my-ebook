import type { DatabaseConnection } from '../database-connection'
import type {
  InsertOcrPage,
  OcrPageQuery,
  OcrPageResult,
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrPageRecord,
  StoredOcrPage,
} from '../types/ocr'
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { booksTable, ocrLinesTable, ocrPagesTable } from '../schema'
import {
  nextOcrPageColumns,
  ocrLineForChunkingColumns,
  ocrLineRecordColumns,
  ocrPageStatuses,
  type OcrPageStatus,
} from '../schema/ocr'
import { NotFoundBookError } from '../storage-errors'

export function createOcrRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function initializeOcrPages(bookid: string): Promise<void> {
    const book = await db.query.booksTable.findFirst({
      columns: { pageCount: true },
      where: { id: bookid },
    })
    if (!book?.pageCount) throw new NotFoundBookError()

    const pages = Array.from(
      { length: book.pageCount },
      (_, index) =>
        ({
          id: crypto.randomUUID(),
          bookId: bookid,
          pageNumber: index + 1,
          status: 'pending',
        }) satisfies InsertOcrPage,
    )

    const insertPages = pages.map((page) =>
      db.insert(ocrPagesTable).values(page).onConflictDoNothing().toSQL(),
    )
    await sqlocal.batch(() => insertPages)
  }

  async function prepareOcrPagesForRun(bookId: string): Promise<void> {
    await db
      .update(ocrPagesTable)
      .set({ status: 'pending' })
      .where(
        and(
          eq(ocrPagesTable.bookId, bookId),
          inArray(ocrPagesTable.status, ['processing', 'failed']),
        ),
      )
  }

  async function acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null> {
    const nextPage = await sqlocal.transaction(async (tx) => {
      const pendingPageQuery = db
        .select(nextOcrPageColumns)
        .from(ocrPagesTable)
        .where(and(eq(ocrPagesTable.bookId, bookId), eq(ocrPagesTable.status, 'pending')))
        .orderBy(asc(ocrPagesTable.pageNumber))
        .limit(1)
      const [pendingPage] = await tx.query(pendingPageQuery)
      if (!pendingPage) {
        return null
      }

      const { id, pageNumber } = pendingPage
      const claimPageQuery = db
        .update(ocrPagesTable)
        .set({ status: 'processing' })
        .where(and(eq(ocrPagesTable.id, id), eq(ocrPagesTable.status, 'pending')))
        .returning({ id: ocrPagesTable.id })
      const [processingPage] = await tx.query(claimPageQuery)
      if (!processingPage) throw new Error('Unable to claim OCR page')
      return { id, pageNumber }
    })
    return nextPage
  }

  async function storeOcrPage(ocrPage: OcrPageResult): Promise<boolean> {
    const now = Date.now()
    const ocrComplete = await sqlocal.transaction(async (tx) => {
      const pageBookQuery = db
        .select({ bookId: ocrPagesTable.bookId })
        .from(ocrPagesTable)
        .where(eq(ocrPagesTable.id, ocrPage.pageId))
        .limit(1)
      const [pageBook] = await tx.query(pageBookQuery)
      if (!pageBook) throw new NotFoundBookError()
      const { bookId } = pageBook

      const pageOcrLines = ocrPage.lines.map((line, index) => ({
        ...line,
        ocrPageId: ocrPage.pageId,
        lineIndex: index,
      }))

      const insertLines = pageOcrLines.map((ocrLine) =>
        db.insert(ocrLinesTable).values(ocrLine).toSQL(),
      )

      const deleteLinesQuery = db
        .delete(ocrLinesTable)
        .where(eq(ocrLinesTable.ocrPageId, ocrPage.pageId))
      const replaceLines = [deleteLinesQuery.toSQL(), ...insertLines]
      await tx.batch(() => replaceLines)
      const completePageQuery = db
        .update(ocrPagesTable)
        .set({ width: ocrPage.width, height: ocrPage.height, status: 'ready' })
        .where(and(eq(ocrPagesTable.id, ocrPage.pageId), eq(ocrPagesTable.status, 'processing')))
        .returning({ id: ocrPagesTable.id })
      const [completedPage] = await tx.query(completePageQuery)
      if (!completedPage) throw new Error('Unable to store OCR page')

      const incompletePagesQuery = db
        .select({ total: count() })
        .from(ocrPagesTable)
        .where(and(eq(ocrPagesTable.bookId, bookId), ne(ocrPagesTable.status, 'ready')))
      const [incompletePages] = await tx.query(incompletePagesQuery)
      if (incompletePages?.total !== 0) {
        return false
      }
      const completeOcrQuery = db
        .update(booksTable)
        .set({ ocrCompletedAt: now })
        .where(and(eq(booksTable.id, bookId), isNull(booksTable.ocrCompletedAt)))
      await tx.query(completeOcrQuery)
      return true
    })
    return ocrComplete
  }

  async function failOcrPage(pageId: string): Promise<void> {
    const [updated] = await db
      .update(ocrPagesTable)
      .set({ status: 'failed' })
      .where(and(eq(ocrPagesTable.id, pageId), eq(ocrPagesTable.status, 'processing')))
      .returning({ id: ocrPagesTable.id })
    if (!updated) throw new NotFoundBookError()
  }

  async function getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null> {
    const page = await db.query.ocrPagesTable.findFirst({
      columns: { width: true, height: true },
      where: {
        bookId: ocrPageQuery.bookId,
        pageNumber: ocrPageQuery.pageNumber,
        status: 'ready',
      },
      with: {
        lines: {
          columns: { id: false, ocrPageId: false, lineIndex: false },
          orderBy: { lineIndex: 'asc' },
        },
      },
    })
    if (!page) return null
    const { width, height, lines } = page
    if (
      width === null ||
      height === null ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('Invalid stored OCR page')
    }
    const storedPage: StoredOcrPage | null = { width, height, lines }
    return storedPage
  }

  function isOcrPageStatus(value: unknown): value is OcrPageStatus {
    return ocrPageStatuses.some((status) => status === value)
  }

  async function listOcrPages(bookId: string): Promise<OcrPageRecord[]> {
    const pages = await db.query.ocrPagesTable.findMany({
      columns: { pageNumber: true, status: true, width: true, height: true },
      where: { bookId },
      orderBy: { pageNumber: 'asc' },
    })
    if (pages.some((page) => !isOcrPageStatus(page.status))) throw new Error('Invalid OCR pages')
    return pages
  }

  async function listOcrLines({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<OcrLinePage> {
    const [result] = await db
      .select({ total: count() })
      .from(ocrLinesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, ocrLinesTable.ocrPageId))
      .where(eq(ocrPagesTable.bookId, bookId))
    if (!result) throw new Error('Invalid OCR line count')
    const lines = await db
      .select(ocrLineRecordColumns)
      .from(ocrLinesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, ocrLinesTable.ocrPageId))
      .where(eq(ocrPagesTable.bookId, bookId))
      .orderBy(asc(ocrPagesTable.pageNumber), asc(ocrLinesTable.lineIndex))
      .limit(limit)
      .offset(offset)
    const linePage: OcrLinePage = { lines, total: result.total }
    return linePage
  }

  async function getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]> {
    const lines = await db
      .select(ocrLineForChunkingColumns)
      .from(ocrLinesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, ocrLinesTable.ocrPageId))
      .where(eq(ocrPagesTable.bookId, bookId))
      .orderBy(asc(ocrPagesTable.pageNumber), asc(ocrLinesTable.lineIndex))
    return lines
  }

  const repository = {
    initializeOcrPages,
    prepareOcrPagesForRun,
    acquireNextOcrPage,
    storeOcrPage,
    failOcrPage,
    getStoredOcrPage,
    listOcrPages,
    listOcrLines,
    getOcrLinesForChunking,
  }
  return repository
}
