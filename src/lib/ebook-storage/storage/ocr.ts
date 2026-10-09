import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import type {
  GetStoredOcrPageInput,
  InitializeOcrPagesInput,
  ListOcrLinesInput,
  StoreOcrPageInput,
} from '../data/inputs'
import type {
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrPageRecord,
  StoredOcrPage,
} from '../data/ocr'
import { books, ocrLines, ocrPages } from '../schema'
import { NotFoundBookError } from './errors'

export async function initializeOcrPages(
  database: SQLocalDrizzle,
  input: InitializeOcrPagesInput,
): Promise<void> {
  const db = drizzle(database.driver)
  const [book] = await db
    .select({ pageCount: books.pageCount })
    .from(books)
    .where(eq(books.id, input.bookId))
  if (!book?.pageCount) throw new NotFoundBookError()

  const now = Date.now()
  await database.batch(() =>
    Array.from({ length: input.pageCount }, (_, index) =>
      db
        .insert(ocrPages)
        .values({
          id: crypto.randomUUID(),
          bookId: input.bookId,
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

export async function prepareOcrPagesForRun(
  database: SQLocalDrizzle,
  bookId: string,
): Promise<void> {
  await drizzle(database.driver)
    .update(ocrPages)
    .set({ status: 'pending', updatedAt: Date.now() })
    .where(and(eq(ocrPages.bookId, bookId), inArray(ocrPages.status, ['processing', 'failed'])))
}

export async function acquireNextOcrPage(
  database: SQLocalDrizzle,
  bookId: string,
): Promise<NextOcrPage | null> {
  const db = drizzle(database.driver)
  const now = Date.now()
  return await database.transaction(async (tx) => {
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

export async function storeOcrPage(
  database: SQLocalDrizzle,
  input: StoreOcrPageInput,
): Promise<boolean> {
  const db = drizzle(database.driver)
  const now = Date.now()
  return await database.transaction(async (tx) => {
    const [page] = await tx.query(
      db.select({ bookId: ocrPages.bookId }).from(ocrPages).where(eq(ocrPages.id, input.pageId)),
    )
    if (!page) throw new NotFoundBookError()
    const { bookId } = page

    await tx.batch(() => [
      db.delete(ocrLines).where(eq(ocrLines.ocrPageId, input.pageId)).toSQL(),
      ...input.lines.map((line, lineIndex) =>
        db
          .insert(ocrLines)
          .values({
            ocrPageId: input.pageId,
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
        .set({ width: input.width, height: input.height, status: 'ready', updatedAt: now })
        .where(and(eq(ocrPages.id, input.pageId), eq(ocrPages.status, 'processing')))
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

export async function failOcrPage(database: SQLocalDrizzle, pageId: string): Promise<void> {
  const [updated] = await drizzle(database.driver)
    .update(ocrPages)
    .set({ status: 'failed', updatedAt: Date.now() })
    .where(and(eq(ocrPages.id, pageId), eq(ocrPages.status, 'processing')))
    .returning({ id: ocrPages.id })
  if (!updated) throw new NotFoundBookError()
}

export async function getStoredOcrPage(
  database: SQLocalDrizzle,
  input: GetStoredOcrPageInput,
): Promise<StoredOcrPage | null> {
  const db = drizzle(database.driver)
  const [page] = await db
    .select({ id: ocrPages.id, width: ocrPages.width, height: ocrPages.height })
    .from(ocrPages)
    .where(
      and(
        eq(ocrPages.bookId, input.bookId),
        eq(ocrPages.pageNumber, input.pageNumber),
        eq(ocrPages.status, 'ready'),
      ),
    )
  if (!page) return null
  const { id, width, height } = page
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
  const lines = await db
    .select({
      rawText: ocrLines.rawText,
      x0: ocrLines.x0,
      y0: ocrLines.y0,
      x1: ocrLines.x1,
      y1: ocrLines.y1,
    })
    .from(ocrLines)
    .where(eq(ocrLines.ocrPageId, id))
    .orderBy(asc(ocrLines.lineIndex))
  return { width, height, lines }
}

function isOcrPageStatus(value: unknown): value is OcrPageRecord['status'] {
  return value === 'pending' || value === 'processing' || value === 'ready' || value === 'failed'
}

export async function listOcrPages(
  database: SQLocalDrizzle,
  bookId: string,
): Promise<OcrPageRecord[]> {
  const pages = await drizzle(database.driver)
    .select({
      page_number: ocrPages.pageNumber,
      status: ocrPages.status,
      width: ocrPages.width,
      height: ocrPages.height,
    })
    .from(ocrPages)
    .where(eq(ocrPages.bookId, bookId))
    .orderBy(asc(ocrPages.pageNumber))
  if (pages.some((page) => !isOcrPageStatus(page.status))) throw new Error('Invalid OCR pages')
  return pages
}

export async function listOcrLines(
  database: SQLocalDrizzle,
  input: ListOcrLinesInput,
): Promise<OcrLinePage> {
  const db = drizzle(database.driver)
  const [result] = await db
    .select({ total: count() })
    .from(ocrLines)
    .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
    .where(eq(ocrPages.bookId, input.bookId))
  if (!result) throw new Error('Invalid OCR line count')
  const lines = await db
    .select({
      page_number: ocrPages.pageNumber,
      line_index: ocrLines.lineIndex,
      raw_text: ocrLines.rawText,
      x0: ocrLines.x0,
      y0: ocrLines.y0,
      x1: ocrLines.x1,
      y1: ocrLines.y1,
    })
    .from(ocrLines)
    .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
    .where(eq(ocrPages.bookId, input.bookId))
    .orderBy(asc(ocrPages.pageNumber), asc(ocrLines.lineIndex))
    .limit(input.limit)
    .offset(input.offset)
  return { lines, total: result.total }
}

export async function getOcrLinesForChunking(
  database: SQLocalDrizzle,
  bookId: string,
): Promise<OcrLineForChunking[]> {
  const lines = await drizzle(database.driver)
    .select({
      ocr_page_id: ocrPages.id,
      page_number: ocrPages.pageNumber,
      line_index: ocrLines.lineIndex,
      raw_text: ocrLines.rawText,
    })
    .from(ocrLines)
    .innerJoin(ocrPages, eq(ocrPages.id, ocrLines.ocrPageId))
    .where(eq(ocrPages.bookId, bookId))
    .orderBy(asc(ocrPages.pageNumber), asc(ocrLines.lineIndex))
  return lines.map((line) => {
    const { ocr_page_id } = line
    if (ocr_page_id === null) throw new Error('Invalid OCR lines for chunking')
    return { ...line, ocr_page_id }
  })
}
