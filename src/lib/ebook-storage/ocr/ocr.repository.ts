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
import type { BookPageMetadata, BookRecordsQuery } from '../types/book'
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { books, ocrLines, ocrPages } from '../schema'
import { NotFoundBookError } from '../storage-errors'

export function createOcrRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function initializeOcrPages(bookMetadata: BookPageMetadata): Promise<void> {
    const book = await db.query.books.findFirst({
      columns: { pageCount: true },
      where: eq(books.id, bookMetadata.bookId),
    })
    if (!book?.pageCount) throw new NotFoundBookError()

    const now = Date.now()
    await sqlocal.batch(() =>
      Array.from({ length: bookMetadata.pageCount }, (_, index) =>
        db
          .insert(ocrPages)
          .values({
            id: crypto.randomUUID(),
            bookId: bookMetadata.bookId,
            pageNumber: index + 1,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .toSQL(),
      ),
    )
  }

  async function prepareOcrPagesForRun(bookId: string): Promise<void> {
    await db
      .update(ocrPages)
      .set({ status: 'pending', updatedAt: Date.now() })
      .where(and(eq(ocrPages.bookId, bookId), inArray(ocrPages.status, ['processing', 'failed'])))
  }

  async function acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null> {
    const now = Date.now()
    return await sqlocal.transaction(async (tx) => {
      const [page] = await tx.query(
        db
          .select({ id: ocrPages.id, pageNumber: ocrPages.pageNumber })
          .from(ocrPages)
          .where(and(eq(ocrPages.bookId, bookId), eq(ocrPages.status, 'pending')))
          .orderBy(asc(ocrPages.pageNumber))
          .limit(1),
      )
      if (!page) {
        return null
      }

      const { id, pageNumber } = page
      if (id === null) throw new Error('Invalid OCR page')
      const [updated] = await tx.query(
        db
          .update(ocrPages)
          .set({ status: 'processing', updatedAt: now })
          .where(and(eq(ocrPages.id, id), eq(ocrPages.status, 'pending')))
          .returning({ id: ocrPages.id }),
      )
      if (!updated) throw new Error('Unable to claim OCR page')
      return { id, pageNumber }
    })
  }

  async function storeOcrPage(ocrPage: OcrPageResult): Promise<boolean> {
    const now = Date.now()
    return await sqlocal.transaction(async (tx) => {
      const [page] = await tx.query(
        db
          .select({ bookId: ocrPages.bookId })
          .from(ocrPages)
          .where(eq(ocrPages.id, ocrPage.pageId)),
      )
      if (!page) throw new NotFoundBookError()
      const { bookId } = page

      await tx.batch(() => [
        db.delete(ocrLines).where(eq(ocrLines.ocrPageId, ocrPage.pageId)).toSQL(),
        ...ocrPage.lines.map((line, lineIndex) =>
          db
            .insert(ocrLines)
            .values({
              ocrPageId: ocrPage.pageId,
              lineIndex,
              rawText: line.rawText,
              x0: line.x0,
              y0: line.y0,
              x1: line.x1,
              y1: line.y1,
            })
            .toSQL(),
        ),
      ])
      const [updated] = await tx.query(
        db
          .update(ocrPages)
          .set({ width: ocrPage.width, height: ocrPage.height, status: 'ready', updatedAt: now })
          .where(and(eq(ocrPages.id, ocrPage.pageId), eq(ocrPages.status, 'processing')))
          .returning({ id: ocrPages.id }),
      )
      if (!updated) throw new Error('Unable to store OCR page')

      const [incompletePages] = await tx.query(
        db
          .select({ total: count() })
          .from(ocrPages)
          .where(and(eq(ocrPages.bookId, bookId), ne(ocrPages.status, 'ready'))),
      )
      if (incompletePages?.total !== 0) {
        return false
      }
      await tx.query(
        db
          .update(books)
          .set({ ocrCompletedAt: now, updatedAt: now })
          .where(and(eq(books.id, bookId), isNull(books.ocrCompletedAt))),
      )
      return true
    })
  }

  async function failOcrPage(pageId: string): Promise<void> {
    const [updated] = await db
      .update(ocrPages)
      .set({ status: 'failed', updatedAt: Date.now() })
      .where(and(eq(ocrPages.id, pageId), eq(ocrPages.status, 'processing')))
      .returning({ id: ocrPages.id })
    if (!updated) throw new NotFoundBookError()
  }

  async function getStoredOcrPage(ocrPageQuery: OcrPageQuery): Promise<StoredOcrPage | null> {
    const page = await db.query.ocrPages.findFirst({
      columns: { id: true, width: true, height: true },
      where: and(
        eq(ocrPages.bookId, ocrPageQuery.bookId),
        eq(ocrPages.pageNumber, ocrPageQuery.pageNumber),
        eq(ocrPages.status, 'ready'),
      ),
      with: {
        lines: {
          columns: { id: false, ocrPageId: false, lineIndex: false },
          orderBy: [asc(ocrLines.lineIndex)],
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
    return { width, height, lines }
  }

  function isOcrPageStatus(value: unknown): value is OcrPageRecord['status'] {
    return value === 'pending' || value === 'processing' || value === 'ready' || value === 'failed'
  }

  async function listOcrPages(bookId: string): Promise<OcrPageRecord[]> {
    const pages = await db.query.ocrPages.findMany({
      columns: { pageNumber: true, status: true, width: true, height: true },
      where: eq(ocrPages.bookId, bookId),
      orderBy: [asc(ocrPages.pageNumber)],
    })
    if (pages.some((page) => !isOcrPageStatus(page.status))) throw new Error('Invalid OCR pages')
    return pages
  }

  async function listOcrLines(ocrLineQuery: BookRecordsQuery): Promise<OcrLinePage> {
    const [result] = await db
      .select({ total: count() })
      .from(ocrLines)
      .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
      .where(eq(ocrPages.bookId, ocrLineQuery.bookId))
    if (!result) throw new Error('Invalid OCR line count')
    const lines = await db
      .select({
        pageNumber: ocrPages.pageNumber,
        lineIndex: ocrLines.lineIndex,
        rawText: ocrLines.rawText,
        x0: ocrLines.x0,
        y0: ocrLines.y0,
        x1: ocrLines.x1,
        y1: ocrLines.y1,
      })
      .from(ocrLines)
      .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
      .where(eq(ocrPages.bookId, ocrLineQuery.bookId))
      .orderBy(asc(ocrPages.pageNumber), asc(ocrLines.lineIndex))
      .limit(ocrLineQuery.limit)
      .offset(ocrLineQuery.offset)
    return { lines, total: result.total }
  }

  async function getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]> {
    const lines = await db
      .select({
        ocrPageId: ocrLines.ocrPageId,
        pageNumber: ocrPages.pageNumber,
        lineIndex: ocrLines.lineIndex,
        rawText: ocrLines.rawText,
      })
      .from(ocrLines)
      .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
      .where(eq(ocrPages.bookId, bookId))
      .orderBy(asc(ocrPages.pageNumber), asc(ocrLines.lineIndex))
    return lines
  }

  return {
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
}
