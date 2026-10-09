import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm'
import {
  books,
  chunkSources,
  ocrLines,
  ocrPages,
  searchChunks as searchChunksTable,
  searchPostings,
  searchTerms,
} from '../schema'
import { SQLITE_COMMAND } from '../commands'
import type { AddBookInput, BookAnalysisStatus } from '../data/book'
import type { SearchChunkResult, SearchChunkSource } from '../data/search'
import type {
  ChunkSourcePage,
  SearchChunkInput,
  SearchChunkPage,
  SearchPostingPage,
  SearchTermPage,
} from '../data/search-index'
import type {
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrPageRecord,
  StoredOcrPage,
} from '../data/ocr'
import {
  DELETE_ORPHAN_SEARCH_TERMS_SQL,
  DELETE_SEARCH_CHUNKS_BY_BOOK_ID_SQL,
  INSERT_CHUNK_SOURCE_SQL,
  INSERT_SEARCH_CHUNK_SQL,
  INSERT_SEARCH_POSTING_SQL,
  REFRESH_SEARCH_TERM_DOCUMENT_FREQUENCY_SQL,
  SELECT_BOOK_EXISTS_SQL,
  SELECT_OCR_PAGE_BOOK_ID_SQL,
  createSearchChunksSql,
  SELECT_SEARCH_TERM_ID_SQL,
  SET_BOOK_INDEXED_SQL,
  UPSERT_SEARCH_TERM_SQL,
} from './queries'
import {
  DeletedBookError,
  DuplicateBookError,
  NotFoundBookError,
  UnsupportedCommandError,
} from './errors'
import {
  getPayload,
  isRowAffected,
  isSearchChunkQuery,
  isInitializeOcrPagesInput,
  isGetStoredOcrPageInput,
  isListOcrLinesInput,
  isStoreOcrPageInput,
  isStoreSearchIndexInput,
  isUpdateCoverInput,
  isUpdateProgressInput,
  isUpdateTitleInput,
  normalizeStoredProgress,
  type StorageRequest,
} from './validation'

type SqliteCommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]

const SQLITE_COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(SQLITE_COMMAND))

export function isSqliteCommand(command: string): command is SqliteCommand {
  return SQLITE_COMMAND_LIST.has(command)
}

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

    await tx.sql<Record<string, unknown>>(DELETE_ORPHAN_SEARCH_TERMS_SQL)
    await tx.sql<Record<string, unknown>>(REFRESH_SEARCH_TERM_DOCUMENT_FREQUENCY_SQL)
  })
}

export function getBookId(request: StorageRequest): string {
  return getPayload(
    request,
    request.command,
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
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

async function hasBook(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
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

async function updateProgress(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const input = getPayload(request, request.command, isUpdateProgressInput)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ lastPage: input.page, updatedAt: Date.now() })
    .where(and(eq(books.id, input.id), gte(books.pageCount, input.page)))
    .returning({ id: books.id })
  if (!updated) throw new DeletedBookError()
}

async function updateTitle(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const input = getPayload(request, request.command, isUpdateTitleInput)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ title: input.title.trim(), updatedAt: Date.now() })
    .where(eq(books.id, input.id))
    .returning({ id: books.id })
  if (!updated) throw new DeletedBookError()
}

async function updateCover(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
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

// 업로든한 PDF의 페이지 수를 보고 페이지 개수만큼 저장한다.
async function initializeOcrPages(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const input = getPayload(request, request.command, isInitializeOcrPagesInput)
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

async function prepareOcrPagesForRun(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const bookId = getBookId(request)
  await drizzle(database.driver)
    .update(ocrPages)
    .set({ status: 'pending', updatedAt: Date.now() })
    .where(and(eq(ocrPages.bookId, bookId), inArray(ocrPages.status, ['processing', 'failed'])))
}

async function acquireNextOcrPage(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<NextOcrPage | null> {
  const bookId = getBookId(request)
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

async function storeOcrPage(database: SQLocalDrizzle, request: StorageRequest): Promise<boolean> {
  const input = getPayload(request, request.command, isStoreOcrPageInput)
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

async function failOcrPage(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const pageId = getBookId(request)
  const [updated] = await drizzle(database.driver)
    .update(ocrPages)
    .set({ status: 'failed', updatedAt: Date.now() })
    .where(and(eq(ocrPages.id, pageId), eq(ocrPages.status, 'processing')))
    .returning({ id: ocrPages.id })
  if (!updated) throw new NotFoundBookError()
}

async function failBookAnalysis(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const bookId = getBookId(request)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ analysisStatus: 'failed', updatedAt: Date.now() })
    .where(eq(books.id, bookId))
    .returning({ id: books.id })
  if (!updated) throw new NotFoundBookError()
}

async function getBookAnalysisStatus(
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

async function retryBookAnalysis(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const bookId = getBookId(request)
  const [updated] = await drizzle(database.driver)
    .update(books)
    .set({ analysisStatus: 'analyzing', updatedAt: Date.now() })
    .where(and(eq(books.id, bookId), eq(books.analysisStatus, 'failed')))
    .returning({ id: books.id })
  if (!updated) throw new NotFoundBookError()
}

async function getStoredOcrPage(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<StoredOcrPage | null> {
  const input = getPayload(request, request.command, isGetStoredOcrPageInput)
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

async function listOcrPages(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrPageRecord[]> {
  const bookId = getBookId(request)
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

async function listOcrLines(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrLinePage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
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

async function getOcrLinesForChunking(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrLineForChunking[]> {
  const bookId = getBookId(request)
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

async function storeSearchChunk(
  database: Pick<SQLocalDrizzle, 'sql'>,
  bookId: string,
  chunk: SearchChunkInput,
  createdAt: number,
): Promise<void> {
  await database.sql<Record<string, unknown>>(
    INSERT_SEARCH_CHUNK_SQL,
    chunk.id,
    bookId,
    chunk.ordinal,
    chunk.text,
    chunk.tokenCount,
    createdAt,
  )
  for (const source of chunk.sources) {
    const sourcePage = (
      await database.sql<Record<string, unknown>>(SELECT_OCR_PAGE_BOOK_ID_SQL, source.ocrPageId)
    )[0]
    if (sourcePage?.book_id !== bookId) {
      throw new Error('Chunk source does not belong to book')
    }
    await database.sql<Record<string, unknown>>(
      INSERT_CHUNK_SOURCE_SQL,
      chunk.id,
      source.ocrPageId,
      source.startLineIndex,
      source.endLineIndex,
      source.sourceOrder,
    )
  }
}

async function storeSearchIndex(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const input = getPayload(request, request.command, isStoreSearchIndexInput)
  if (
    !(await database.sql<Record<string, unknown>>(SELECT_BOOK_EXISTS_SQL, input.bookId))[0]?.['1']
  )
    throw new NotFoundBookError()

  const now = Date.now()
  return await database.transaction(async (tx) => {
    await tx.sql<Record<string, unknown>>(DELETE_SEARCH_CHUNKS_BY_BOOK_ID_SQL, input.bookId)
    await tx.sql<Record<string, unknown>>(DELETE_ORPHAN_SEARCH_TERMS_SQL)
    await tx.sql<Record<string, unknown>>(REFRESH_SEARCH_TERM_DOCUMENT_FREQUENCY_SQL)

    for (const chunk of input.chunks) {
      await storeSearchChunk(tx, input.bookId, chunk, now)
      for (const { term, termFrequency } of chunk.terms) {
        await tx.sql<Record<string, unknown>>(UPSERT_SEARCH_TERM_SQL, term)
        const termId = (
          await tx.sql<Record<string, unknown>>(SELECT_SEARCH_TERM_ID_SQL, term)
        )[0]?.['id']
        if (typeof termId !== 'number' || !Number.isSafeInteger(termId) || termId <= 0) {
          throw new Error('Unable to store search term')
        }
        await tx.sql<Record<string, unknown>>(
          INSERT_SEARCH_POSTING_SQL,
          termId,
          chunk.id,
          termFrequency,
        )
      }
    }
    await tx.sql<Record<string, unknown>>(SET_BOOK_INDEXED_SQL, now, now, input.bookId)
    if (!(await isRowAffected(tx))) throw new NotFoundBookError()
  })
}

async function listSearchChunks(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchChunkPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const db = drizzle(database.driver)
  const [result] = await db
    .select({ total: count() })
    .from(searchChunksTable)
    .where(eq(searchChunksTable.bookId, input.bookId))
  if (!result) throw new Error('Invalid search chunk count')
  const rows = await db
    .select({
      id: searchChunksTable.id,
      ordinal: searchChunksTable.ordinal,
      text: searchChunksTable.text,
      token_count: searchChunksTable.tokenCount,
      created_at: searchChunksTable.createdAt,
    })
    .from(searchChunksTable)
    .where(eq(searchChunksTable.bookId, input.bookId))
    .orderBy(asc(searchChunksTable.ordinal))
    .limit(input.limit)
    .offset(input.offset)
  const chunks = rows.map((row) => {
    const { id } = row
    if (id === null) throw new Error('Invalid search chunks')
    return { ...row, id }
  })
  return { chunks, total: result.total }
}

function isSearchChunkResultRow(value: unknown): value is {
  id: string
  ordinal: number
  text: string
  token_count: number
  score: number
} {
  if (typeof value !== 'object' || value === null) return false
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'ordinal' in value &&
    typeof value.ordinal === 'number' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'token_count' in value &&
    typeof value.token_count === 'number' &&
    'score' in value &&
    typeof value.score === 'number' &&
    Number.isFinite(value.score)
  )
}

async function searchChunks(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchChunkResult[]> {
  const query = getPayload(request, request.command, isSearchChunkQuery)
  if (query.terms.length === 0) return []

  const rows = await database.sql<Record<string, unknown>>(
    createSearchChunksSql(query.terms.length),
    ...query.terms,
    query.bookId,
    query.limit,
  )
  if (!Array.isArray(rows)) throw new Error('Invalid search chunks')

  const chunks: Omit<SearchChunkResult, 'sources'>[] = []
  for (const row of rows) {
    if (!isSearchChunkResultRow(row)) throw new Error('Invalid search chunks')
    chunks.push({
      id: row.id,
      ordinal: row.ordinal,
      text: row.text,
      tokenCount: row.token_count,
      score: row.score,
    })
  }
  if (chunks.length === 0) return []

  const sourceRows = await drizzle(database.driver)
    .select({
      chunk_id: chunkSources.chunkId,
      page_number: ocrPages.pageNumber,
      start_line_index: chunkSources.startLineIndex,
      end_line_index: chunkSources.endLineIndex,
    })
    .from(chunkSources)
    .innerJoin(ocrPages, eq(ocrPages.id, chunkSources.ocrPageId))
    .where(
      inArray(
        chunkSources.chunkId,
        chunks.map(({ id }) => id),
      ),
    )
    .orderBy(asc(chunkSources.chunkId), asc(chunkSources.sourceOrder))

  const sourcesByChunkId = new Map<string, SearchChunkSource[]>()
  for (const row of sourceRows) {
    const sources = sourcesByChunkId.get(row.chunk_id) ?? []
    sources.push({
      pageNumber: row.page_number,
      startLineIndex: row.start_line_index,
      endLineIndex: row.end_line_index,
    })
    sourcesByChunkId.set(row.chunk_id, sources)
  }

  return chunks.map((chunk) => ({ ...chunk, sources: sourcesByChunkId.get(chunk.id) ?? [] }))
}

async function listSearchTerms(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchTermPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const db = drizzle(database.driver)
  const [result] = await db
    .select({ total: countDistinct(searchTerms.id) })
    .from(searchTerms)
    .innerJoin(searchPostings, eq(searchPostings.termId, searchTerms.id))
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
    .where(eq(searchChunksTable.bookId, input.bookId))
  if (!result) throw new Error('Invalid search term count')
  const rows = await db
    .select({
      id: searchTerms.id,
      term: searchTerms.term,
      document_frequency: searchTerms.documentFrequency,
    })
    .from(searchTerms)
    .innerJoin(searchPostings, eq(searchPostings.termId, searchTerms.id))
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
    .where(eq(searchChunksTable.bookId, input.bookId))
    .groupBy(searchTerms.id)
    .orderBy(asc(searchTerms.term))
    .limit(input.limit)
    .offset(input.offset)
  const terms = rows.map((row) => {
    const { id } = row
    if (id === null) throw new Error('Invalid search terms')
    return { ...row, id }
  })
  return { terms, total: result.total }
}

async function listSearchPostings(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchPostingPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const db = drizzle(database.driver)
  const [result] = await db
    .select({ total: count() })
    .from(searchPostings)
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
    .where(eq(searchChunksTable.bookId, input.bookId))
  if (!result) throw new Error('Invalid search posting count')
  const postings = await db
    .select({
      term_id: searchPostings.termId,
      chunk_id: searchPostings.chunkId,
      term_frequency: searchPostings.termFrequency,
      term: searchTerms.term,
      chunk_ordinal: searchChunksTable.ordinal,
    })
    .from(searchPostings)
    .innerJoin(searchTerms, eq(searchTerms.id, searchPostings.termId))
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
    .where(eq(searchChunksTable.bookId, input.bookId))
    .orderBy(asc(searchTerms.term), asc(searchChunksTable.ordinal))
    .limit(input.limit)
    .offset(input.offset)
  return { postings, total: result.total }
}

async function listChunkSources(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<ChunkSourcePage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const db = drizzle(database.driver)
  const [result] = await db
    .select({ total: count() })
    .from(chunkSources)
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSources.chunkId))
    .where(eq(searchChunksTable.bookId, input.bookId))
  if (!result) throw new Error('Invalid chunk source count')
  const rows = await db
    .select({
      id: chunkSources.id,
      chunk_id: chunkSources.chunkId,
      chunk_ordinal: searchChunksTable.ordinal,
      ocr_page_id: chunkSources.ocrPageId,
      page_number: ocrPages.pageNumber,
      start_line_index: chunkSources.startLineIndex,
      end_line_index: chunkSources.endLineIndex,
      source_order: chunkSources.sourceOrder,
    })
    .from(chunkSources)
    .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSources.chunkId))
    .innerJoin(ocrPages, eq(ocrPages.id, chunkSources.ocrPageId))
    .where(eq(searchChunksTable.bookId, input.bookId))
    .orderBy(asc(searchChunksTable.ordinal), asc(chunkSources.sourceOrder))
    .limit(input.limit)
    .offset(input.offset)
  const sources = rows.map((row) => {
    const { id } = row
    if (id === null) throw new Error('Invalid chunk sources')
    return { ...row, id }
  })
  return { sources, total: result.total }
}

export async function executeSqliteCommand(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<unknown> {
  switch (request.command) {
    case SQLITE_COMMAND.INITIALIZE:
      return undefined
    case SQLITE_COMMAND.HAS_BOOK:
      return hasBook(database, request)
    case SQLITE_COMMAND.UPDATE_PROGRESS:
      return updateProgress(database, request)
    case SQLITE_COMMAND.UPDATE_TITLE:
      return updateTitle(database, request)
    case SQLITE_COMMAND.UPDATE_COVER:
      return updateCover(database, request)
    case SQLITE_COMMAND.INITIALIZE_OCR_PAGES:
      return initializeOcrPages(database, request)
    case SQLITE_COMMAND.PREPARE_OCR_PAGES_FOR_RUN:
      return prepareOcrPagesForRun(database, request)
    case SQLITE_COMMAND.ACQUIRE_NEXT_OCR_PAGE:
      return acquireNextOcrPage(database, request)
    case SQLITE_COMMAND.STORE_OCR_PAGE:
      return storeOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_OCR_PAGE:
      return failOcrPage(database, request)
    case SQLITE_COMMAND.FAIL_BOOK_ANALYSIS:
      return failBookAnalysis(database, request)
    case SQLITE_COMMAND.RETRY_BOOK_ANALYSIS:
      return retryBookAnalysis(database, request)
    case SQLITE_COMMAND.LIST_OCR_LINES:
      return listOcrLines(database, request)
    case SQLITE_COMMAND.GET_STORED_OCR_PAGE:
      return getStoredOcrPage(database, request)
    case SQLITE_COMMAND.LIST_OCR_PAGES:
      return listOcrPages(database, request)
    case SQLITE_COMMAND.GET_BOOK_ANALYSIS_STATUS:
      return getBookAnalysisStatus(database, request)
    case SQLITE_COMMAND.GET_OCR_LINES_FOR_CHUNKING:
      return getOcrLinesForChunking(database, request)
    case SQLITE_COMMAND.STORE_SEARCH_INDEX:
      return storeSearchIndex(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_CHUNKS:
      return listSearchChunks(database, request)
    case SQLITE_COMMAND.LIST_CHUNK_SOURCES:
      return listChunkSources(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_TERMS:
      return listSearchTerms(database, request)
    case SQLITE_COMMAND.LIST_SEARCH_POSTINGS:
      return listSearchPostings(database, request)
    case SQLITE_COMMAND.SEARCH_CHUNKS:
      return searchChunks(database, request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
