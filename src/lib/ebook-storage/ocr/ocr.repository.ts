import type { DatabaseConnection } from '../database-connection'
import type {
  OcrPageQuery,
  OcrPageResult,
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrPageRecord,
  StoredOcrPage,
} from '../types/ocr'
import type { BookRecordsQuery } from '../types/book'
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { booksTable, ocrLinesTable, ocrPagesTable } from '../schema'
import { NotFoundBookError } from '../storage-errors'

type OcrPageInsert = typeof ocrPagesTable.$inferInsert

export function createOcrRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function initializeOcrPages(bookid: string): Promise<void> {
    const book = await db.query.booksTable.findFirst({
      columns: { pageCount: true },
      where: eq(booksTable.id, bookid),
    })
    if (!book?.pageCount) throw new NotFoundBookError()

    const now = Date.now()
    const pages = Array.from(
      { length: book.pageCount },
      (_, index) =>
        ({
          id: crypto.randomUUID(),
          bookId: bookid,
          pageNumber: index + 1,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        }) satisfies OcrPageInsert,
    )

    const insertPagesSqlStatements = pages.map((page) =>
      db.insert(ocrPagesTable).values(page).onConflictDoNothing().toSQL(),
    )
    await sqlocal.batch(() => insertPagesSqlStatements)
  }

  async function prepareOcrPagesForRun(bookId: string): Promise<void> {
    await db
      .update(ocrPagesTable)
      .set({ status: 'pending', updatedAt: Date.now() })
      .where(
        and(
          eq(ocrPagesTable.bookId, bookId),
          inArray(ocrPagesTable.status, ['processing', 'failed']),
        ),
      )
  }

  async function acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null> {
    const now = Date.now()
    const nextPage = await sqlocal.transaction(async (tx) => {
      const [page] = await tx.query(
        db
          .select({ id: ocrPagesTable.id, pageNumber: ocrPagesTable.pageNumber })
          .from(ocrPagesTable)
          .where(and(eq(ocrPagesTable.bookId, bookId), eq(ocrPagesTable.status, 'pending')))
          .orderBy(asc(ocrPagesTable.pageNumber))
          .limit(1),
      )
      if (!page) {
        return null
      }

      const { id, pageNumber } = page
      if (id === null) throw new Error('Invalid OCR page')
      const [updated] = await tx.query(
        db
          .update(ocrPagesTable)
          .set({ status: 'processing', updatedAt: now })
          .where(and(eq(ocrPagesTable.id, id), eq(ocrPagesTable.status, 'pending')))
          .returning({ id: ocrPagesTable.id }),
      )
      if (!updated) throw new Error('Unable to claim OCR page')
      const claimedPage = { id, pageNumber }
      return claimedPage
    })
    return nextPage
  }

  async function storeOcrPage(ocrPage: OcrPageResult): Promise<boolean> {
    const now = Date.now()
    const isBookOcrComplete = await sqlocal.transaction(async (tx) => {
      const [page] = await tx.query(
        db
          .select({ bookId: ocrPagesTable.bookId })
          .from(ocrPagesTable)
          .where(eq(ocrPagesTable.id, ocrPage.pageId)),
      )
      if (!page) throw new NotFoundBookError()
      const { bookId } = page

      const pageOcrLines = ocrPage.lines.map((line, index) => ({
        ...line,
        ocrPageId: ocrPage.pageId,
        lineIndex: index,
      }))

      const insertOcrLinesSqlStatements = pageOcrLines.map((ocrLine) =>
        db.insert(ocrLinesTable).values(ocrLine).toSQL(),
      )

      await tx.batch(() => [
        db.delete(ocrLinesTable).where(eq(ocrLinesTable.ocrPageId, ocrPage.pageId)).toSQL(),
        ...insertOcrLinesSqlStatements,
      ])
      const [updated] = await tx.query(
        db
          .update(ocrPagesTable)
          .set({ width: ocrPage.width, height: ocrPage.height, status: 'ready', updatedAt: now })
          .where(and(eq(ocrPagesTable.id, ocrPage.pageId), eq(ocrPagesTable.status, 'processing')))
          .returning({ id: ocrPagesTable.id }),
      )
      if (!updated) throw new Error('Unable to store OCR page')

      const [incompletePages] = await tx.query(
        db
          .select({ total: count() })
          .from(ocrPagesTable)
          .where(and(eq(ocrPagesTable.bookId, bookId), ne(ocrPagesTable.status, 'ready'))),
      )
      if (incompletePages?.total !== 0) {
        return false
      }
      await tx.query(
        db
          .update(booksTable)
          .set({ ocrCompletedAt: now, updatedAt: now })
          .where(and(eq(booksTable.id, bookId), isNull(booksTable.ocrCompletedAt))),
      )
      return true
    })
    return isBookOcrComplete
  }

  async function failOcrPage(pageId: string): Promise<void> {
    const [updated] = await db
      .update(ocrPagesTable)
      .set({ status: 'failed', updatedAt: Date.now() })
      .where(and(eq(ocrPagesTable.id, pageId), eq(ocrPagesTable.status, 'processing')))
      .returning({ id: ocrPagesTable.id })
    if (!updated) throw new NotFoundBookError()
  }

  async function getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null> {
    const page = await db.query.ocrPagesTable.findFirst({
      columns: { id: true, width: true, height: true },
      where: and(
        eq(ocrPagesTable.bookId, ocrPageQuery.bookId),
        eq(ocrPagesTable.pageNumber, ocrPageQuery.pageNumber),
        eq(ocrPagesTable.status, 'ready'),
      ),
      with: {
        lines: {
          columns: { id: false, ocrPageId: false, lineIndex: false },
          orderBy: [asc(ocrLinesTable.lineIndex)],
        },
      },
    })
    if (!page) return null
    const { id, width, height, lines } = page
    if (
      id === null ||
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

  function isOcrPageStatus(value: unknown): value is OcrPageRecord['status'] {
    return value === 'pending' || value === 'processing' || value === 'ready' || value === 'failed'
  }

  async function listOcrPages(bookId: string): Promise<OcrPageRecord[]> {
    const pages = await db.query.ocrPagesTable.findMany({
      columns: { pageNumber: true, status: true, width: true, height: true },
      where: eq(ocrPagesTable.bookId, bookId),
      orderBy: [asc(ocrPagesTable.pageNumber)],
    })
    if (pages.some((page) => !isOcrPageStatus(page.status))) throw new Error('Invalid OCR pages')
    return pages
  }

  async function listOcrLines(ocrLineQuery: BookRecordsQuery): Promise<OcrLinePage> {
    const [result] = await db
      .select({ total: count() })
      .from(ocrLinesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, ocrLinesTable.ocrPageId))
      .where(eq(ocrPagesTable.bookId, ocrLineQuery.bookId))
    if (!result) throw new Error('Invalid OCR line count')
    const lines = await db
      .select({
        pageNumber: ocrPagesTable.pageNumber,
        lineIndex: ocrLinesTable.lineIndex,
        rawText: ocrLinesTable.rawText,
        x0: ocrLinesTable.x0,
        y0: ocrLinesTable.y0,
        x1: ocrLinesTable.x1,
        y1: ocrLinesTable.y1,
      })
      .from(ocrLinesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, ocrLinesTable.ocrPageId))
      .where(eq(ocrPagesTable.bookId, ocrLineQuery.bookId))
      .orderBy(asc(ocrPagesTable.pageNumber), asc(ocrLinesTable.lineIndex))
      .limit(ocrLineQuery.limit)
      .offset(ocrLineQuery.offset)
    const linePage: OcrLinePage = { lines, total: result.total }
    return linePage
  }

  async function getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]> {
    const lines = await db
      .select({
        ocrPageId: ocrLinesTable.ocrPageId,
        pageNumber: ocrPagesTable.pageNumber,
        lineIndex: ocrLinesTable.lineIndex,
        rawText: ocrLinesTable.rawText,
      })
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
