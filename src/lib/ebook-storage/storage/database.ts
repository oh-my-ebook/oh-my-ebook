import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { and, desc, eq, gte } from 'drizzle-orm'
import { books } from '../schema'
import { SQLITE_COMMAND } from '../commands'
import type { AddBookInput, BookAnalysisStatus } from '../data/book'
import type { SearchChunkResult, SearchChunkSource } from '../data/search'
import type {
  ChunkSourcePage,
  ChunkSourceRecord,
  SearchChunkInput,
  SearchChunkPage,
  SearchChunkRecord,
  SearchPostingPage,
  SearchPostingRecord,
  SearchTermPage,
  SearchTermRecord,
} from '../data/search-index'
import type {
  NextOcrPage,
  OcrLineForChunking,
  OcrLinePage,
  OcrLineRecord,
  OcrPageRecord,
  StoredOcrPage,
} from '../data/ocr'
import {
  DELETE_ORPHAN_SEARCH_TERMS_SQL,
  DELETE_SEARCH_CHUNKS_BY_BOOK_ID_SQL,
  INSERT_CHUNK_SOURCE_SQL,
  INSERT_SEARCH_CHUNK_SQL,
  INSERT_SEARCH_POSTING_SQL,
  RETRY_BOOK_ANALYSIS_SQL,
  REFRESH_SEARCH_TERM_DOCUMENT_FREQUENCY_SQL,
  SELECT_BOOK_EXISTS_SQL,
  SELECT_BOOK_ANALYSIS_STATUS_SQL,
  SELECT_BOOK_PAGE_COUNT_SQL,
  SELECT_INCOMPLETE_OCR_PAGE_COUNT_SQL,
  SELECT_NEXT_OCR_PAGE_SQL,
  SELECT_OCR_PAGE_BOOK_ID_SQL,
  SELECT_OCR_LINE_COUNT_SQL,
  SELECT_OCR_LINES_SQL,
  SELECT_OCR_PAGE_LINES_SQL,
  SELECT_READY_OCR_PAGE_SQL,
  SELECT_OCR_PAGES_SQL,
  SELECT_OCR_LINES_FOR_CHUNKING_SQL,
  SELECT_CHUNK_SOURCE_COUNT_SQL,
  SELECT_CHUNK_SOURCES_SQL,
  SELECT_SEARCH_CHUNK_COUNT_SQL,
  SELECT_SEARCH_CHUNKS_SQL,
  SELECT_SEARCH_POSTING_COUNT_SQL,
  SELECT_SEARCH_POSTINGS_SQL,
  createSearchChunksSql,
  createSearchChunkSourcesSql,
  SELECT_SEARCH_TERM_ID_SQL,
  SELECT_SEARCH_TERM_COUNT_SQL,
  SELECT_SEARCH_TERMS_SQL,
  SET_BOOK_INDEXED_SQL,
  SET_BOOK_ANALYSIS_FAILED_SQL,
  SET_OCR_COMPLETED_AT_SQL,
  SET_OCR_PAGE_FAILED_SQL,
  SET_OCR_PAGE_PROCESSING_SQL,
  SET_OCR_PAGE_READY_SQL,
  INSERT_OCR_LINE_SQL,
  INSERT_OCR_PAGE_SQL,
  DELETE_OCR_LINES_SQL,
  PREPARE_OCR_PAGES_FOR_RUN_SQL,
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
  if (
    !(await database.sql<Record<string, unknown>>(SELECT_BOOK_PAGE_COUNT_SQL, input.bookId))[0]?.[
      'page_count'
    ]
  ) {
    throw new NotFoundBookError()
  }

  const now = Date.now()
  await database.batch((sql) =>
    Array.from({ length: input.pageCount }, (_, index) =>
      sql(INSERT_OCR_PAGE_SQL, crypto.randomUUID(), input.bookId, index + 1, now, now),
    ),
  )
}

async function prepareOcrPagesForRun(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<void> {
  const bookId = getBookId(request)
  await database.sql<Record<string, unknown>>(PREPARE_OCR_PAGES_FOR_RUN_SQL, Date.now(), bookId)
  return undefined
}

async function acquireNextOcrPage(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<NextOcrPage | null> {
  const bookId = getBookId(request)
  const now = Date.now()
  return await database.transaction(async (tx) => {
    const page = (await tx.sql<Record<string, unknown>>(SELECT_NEXT_OCR_PAGE_SQL, bookId))[0]
    if (!page) {
      return null
    }

    const { id, page_number: pageNumber } = page
    if (typeof id !== 'string' || typeof pageNumber !== 'number')
      throw new Error('Invalid OCR page')
    await tx.sql<Record<string, unknown>>(SET_OCR_PAGE_PROCESSING_SQL, now, id)
    if (!(await isRowAffected(tx))) throw new Error('Unable to claim OCR page')
    return { id, pageNumber }
  })
}

async function storeOcrPage(database: SQLocalDrizzle, request: StorageRequest): Promise<boolean> {
  const input = getPayload(request, request.command, isStoreOcrPageInput)
  const now = Date.now()
  return await database.transaction(async (tx) => {
    const page = (
      await tx.sql<Record<string, unknown>>(SELECT_OCR_PAGE_BOOK_ID_SQL, input.pageId)
    )[0]
    const bookId = page?.book_id
    if (typeof bookId !== 'string') throw new NotFoundBookError()

    await tx.batch((sql) => [
      sql(DELETE_OCR_LINES_SQL, input.pageId),
      ...input.lines.map((line, lineIndex) =>
        sql(
          INSERT_OCR_LINE_SQL,
          input.pageId,
          lineIndex,
          line.rawText,
          line.x0,
          line.y0,
          line.x1,
          line.y1,
        ),
      ),
    ])
    await tx.sql<Record<string, unknown>>(
      SET_OCR_PAGE_READY_SQL,
      input.width,
      input.height,
      now,
      input.pageId,
    )
    if (!(await isRowAffected(tx))) throw new Error('Unable to store OCR page')

    const incompletePages = (
      await tx.sql<Record<string, unknown>>(SELECT_INCOMPLETE_OCR_PAGE_COUNT_SQL, bookId)
    )[0]?.['COUNT(*)']
    if (incompletePages !== 0) {
      return false
    }
    await tx.sql<Record<string, unknown>>(SET_OCR_COMPLETED_AT_SQL, now, now, bookId)
    return true
  })
}

async function failOcrPage(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const pageId = getBookId(request)
  await database.sql<Record<string, unknown>>(SET_OCR_PAGE_FAILED_SQL, Date.now(), pageId)
  if (!(await isRowAffected(database))) throw new NotFoundBookError()
  return undefined
}

async function failBookAnalysis(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const bookId = getBookId(request)
  await database.sql<Record<string, unknown>>(SET_BOOK_ANALYSIS_FAILED_SQL, Date.now(), bookId)
  if (!(await isRowAffected(database))) throw new NotFoundBookError()
  return undefined
}

async function getBookAnalysisStatus(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<BookAnalysisStatus> {
  const bookId = getBookId(request)
  const result = (
    await database.sql<Record<string, unknown>>(SELECT_BOOK_ANALYSIS_STATUS_SQL, bookId)
  )[0]
  if (result?.analysis_status === 'analyzing') return result.analysis_status
  if (result?.analysis_status === 'ready') return result.analysis_status
  if (result?.analysis_status === 'failed') return result.analysis_status
  if (!result) throw new NotFoundBookError()
  throw new Error('Invalid book analysis status')
}

async function retryBookAnalysis(database: SQLocalDrizzle, request: StorageRequest): Promise<void> {
  const bookId = getBookId(request)
  await database.sql<Record<string, unknown>>(RETRY_BOOK_ANALYSIS_SQL, Date.now(), bookId)
  if (!(await isRowAffected(database))) throw new NotFoundBookError()
  return undefined
}

function isOcrLineRecord(value: unknown): value is OcrLineRecord {
  if (!isStoredOcrLine(value)) return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('line_index' in value) || typeof value.line_index !== 'number') return false
  return true
}

function isStoredOcrLine(value: unknown): value is {
  raw_text: string
  x0: number
  y0: number
  x1: number
  y1: number
} {
  if (typeof value !== 'object' || value === null) return false
  if (!('raw_text' in value) || typeof value.raw_text !== 'string') return false
  if (!('x0' in value) || typeof value.x0 !== 'number') return false
  if (!('y0' in value) || typeof value.y0 !== 'number') return false
  if (!('x1' in value) || typeof value.x1 !== 'number') return false
  if (!('y1' in value) || typeof value.y1 !== 'number') return false
  return true
}

async function getStoredOcrPage(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<StoredOcrPage | null> {
  const input = getPayload(request, request.command, isGetStoredOcrPageInput)
  const page = (
    await database.sql<Record<string, unknown>>(
      SELECT_READY_OCR_PAGE_SQL,
      input.bookId,
      input.pageNumber,
    )
  )[0]
  if (!page) return null
  const { id, width, height } = page
  if (
    typeof id !== 'string' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Invalid stored OCR page')
  }
  const lines = await database.sql<Record<string, unknown>>(SELECT_OCR_PAGE_LINES_SQL, id)
  if (!Array.isArray(lines)) throw new Error('Invalid stored OCR lines')
  const storedLines = []
  for (const line of lines) {
    if (!isStoredOcrLine(line)) throw new Error('Invalid stored OCR lines')
    storedLines.push({
      rawText: line.raw_text,
      x0: line.x0,
      y0: line.y0,
      x1: line.x1,
      y1: line.y1,
    })
  }
  return { width, height, lines: storedLines }
}

function isOcrPageRecord(value: unknown): value is OcrPageRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('status' in value) || !isOcrPageStatus(value.status)) return false
  if (!('width' in value) || !(value.width === null || typeof value.width === 'number'))
    return false
  if (!('height' in value) || !(value.height === null || typeof value.height === 'number'))
    return false
  return true
}

function isOcrPageStatus(value: unknown): value is OcrPageRecord['status'] {
  return value === 'pending' || value === 'processing' || value === 'ready' || value === 'failed'
}

async function listOcrPages(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrPageRecord[]> {
  const bookId = getBookId(request)
  const pages = await database.sql<Record<string, unknown>>(SELECT_OCR_PAGES_SQL, bookId)
  if (!Array.isArray(pages)) throw new Error('Invalid OCR pages')
  const ocrPages: OcrPageRecord[] = []
  for (const page of pages) {
    if (!isOcrPageRecord(page)) throw new Error('Invalid OCR pages')
    ocrPages.push({
      page_number: page.page_number,
      status: page.status,
      width: page.width,
      height: page.height,
    })
  }
  return ocrPages
}

async function listOcrLines(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrLinePage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = (
    await database.sql<Record<string, unknown>>(SELECT_OCR_LINE_COUNT_SQL, input.bookId)
  )[0]?.['COUNT(*)']
  if (typeof total !== 'number') throw new Error('Invalid OCR line count')
  const lines = await database.sql<Record<string, unknown>>(
    SELECT_OCR_LINES_SQL,
    input.bookId,
    input.limit,
    input.offset,
  )
  if (!Array.isArray(lines)) throw new Error('Invalid OCR lines')
  const ocrLines: OcrLineRecord[] = []
  for (const line of lines) {
    if (!isOcrLineRecord(line)) throw new Error('Invalid OCR lines')
    ocrLines.push({
      page_number: line.page_number,
      line_index: line.line_index,
      raw_text: line.raw_text,
      x0: line.x0,
      y0: line.y0,
      x1: line.x1,
      y1: line.y1,
    })
  }
  return { lines: ocrLines, total }
}

function isOcrLineForChunking(value: unknown): value is OcrLineForChunking {
  if (typeof value !== 'object' || value === null) return false
  return (
    'ocr_page_id' in value &&
    typeof value.ocr_page_id === 'string' &&
    'page_number' in value &&
    typeof value.page_number === 'number' &&
    'line_index' in value &&
    typeof value.line_index === 'number' &&
    'raw_text' in value &&
    typeof value.raw_text === 'string'
  )
}

async function getOcrLinesForChunking(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<OcrLineForChunking[]> {
  const bookId = getBookId(request)
  const lines = await database.sql<Record<string, unknown>>(
    SELECT_OCR_LINES_FOR_CHUNKING_SQL,
    bookId,
  )
  if (!Array.isArray(lines)) throw new Error('Invalid OCR lines for chunking')

  const ocrLines: OcrLineForChunking[] = []
  for (const line of lines) {
    if (!isOcrLineForChunking(line)) throw new Error('Invalid OCR lines for chunking')
    ocrLines.push({
      ocr_page_id: line.ocr_page_id,
      page_number: line.page_number,
      line_index: line.line_index,
      raw_text: line.raw_text,
    })
  }
  return ocrLines
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

function isSearchChunkRecord(value: unknown): value is SearchChunkRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('ordinal' in value) || typeof value.ordinal !== 'number') return false
  if (!('text' in value) || typeof value.text !== 'string') return false
  if (!('token_count' in value) || typeof value.token_count !== 'number') return false
  if (!('created_at' in value) || typeof value.created_at !== 'number') return false
  return true
}

async function listSearchChunks(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchChunkPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = (
    await database.sql<Record<string, unknown>>(SELECT_SEARCH_CHUNK_COUNT_SQL, input.bookId)
  )[0]?.['COUNT(*)']
  if (typeof total !== 'number') throw new Error('Invalid search chunk count')
  const rows = await database.sql<Record<string, unknown>>(
    SELECT_SEARCH_CHUNKS_SQL,
    input.bookId,
    input.limit,
    input.offset,
  )
  if (!Array.isArray(rows)) throw new Error('Invalid search chunks')

  const chunks: SearchChunkRecord[] = []
  for (const row of rows) {
    if (!isSearchChunkRecord(row)) throw new Error('Invalid search chunks')
    chunks.push(row)
  }
  return { chunks, total }
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

function isSearchChunkSourceRow(value: unknown): value is {
  chunk_id: string
  page_number: number
  start_line_index: number
  end_line_index: number
} {
  if (typeof value !== 'object' || value === null) return false
  return (
    'chunk_id' in value &&
    typeof value.chunk_id === 'string' &&
    'page_number' in value &&
    typeof value.page_number === 'number' &&
    'start_line_index' in value &&
    typeof value.start_line_index === 'number' &&
    'end_line_index' in value &&
    typeof value.end_line_index === 'number'
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

  const sourceRows = await database.sql<Record<string, unknown>>(
    createSearchChunkSourcesSql(chunks.length),
    ...chunks.map(({ id }) => id),
  )
  if (!Array.isArray(sourceRows)) throw new Error('Invalid search chunk sources')

  const sourcesByChunkId = new Map<string, SearchChunkSource[]>()
  for (const row of sourceRows) {
    if (!isSearchChunkSourceRow(row)) throw new Error('Invalid search chunk sources')
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

function isSearchTermRecord(value: unknown): value is SearchTermRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'number') return false
  if (!('term' in value) || typeof value.term !== 'string') return false
  if (!('document_frequency' in value) || typeof value.document_frequency !== 'number') return false
  return true
}

async function listSearchTerms(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchTermPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = (
    await database.sql<Record<string, unknown>>(SELECT_SEARCH_TERM_COUNT_SQL, input.bookId)
  )[0]?.['COUNT(DISTINCT search_terms.id)']
  if (typeof total !== 'number') throw new Error('Invalid search term count')
  const rows = await database.sql<Record<string, unknown>>(
    SELECT_SEARCH_TERMS_SQL,
    input.bookId,
    input.limit,
    input.offset,
  )
  if (!Array.isArray(rows)) throw new Error('Invalid search terms')

  const terms: SearchTermRecord[] = []
  for (const row of rows) {
    if (!isSearchTermRecord(row)) throw new Error('Invalid search terms')
    terms.push(row)
  }
  return { terms, total }
}

function isSearchPostingRecord(value: unknown): value is SearchPostingRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('term_id' in value) || typeof value.term_id !== 'number') return false
  if (!('chunk_id' in value) || typeof value.chunk_id !== 'string') return false
  if (!('term_frequency' in value) || typeof value.term_frequency !== 'number') return false
  if (!('term' in value) || typeof value.term !== 'string') return false
  if (!('chunk_ordinal' in value) || typeof value.chunk_ordinal !== 'number') return false
  return true
}

async function listSearchPostings(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<SearchPostingPage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = (
    await database.sql<Record<string, unknown>>(SELECT_SEARCH_POSTING_COUNT_SQL, input.bookId)
  )[0]?.['COUNT(*)']
  if (typeof total !== 'number') throw new Error('Invalid search posting count')
  const rows = await database.sql<Record<string, unknown>>(
    SELECT_SEARCH_POSTINGS_SQL,
    input.bookId,
    input.limit,
    input.offset,
  )
  if (!Array.isArray(rows)) throw new Error('Invalid search postings')

  const postings: SearchPostingRecord[] = []
  for (const row of rows) {
    if (!isSearchPostingRecord(row)) throw new Error('Invalid search postings')
    postings.push(row)
  }
  return { postings, total }
}

function isChunkSourceRecord(value: unknown): value is ChunkSourceRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'number') return false
  if (!('chunk_id' in value) || typeof value.chunk_id !== 'string') return false
  if (!('chunk_ordinal' in value) || typeof value.chunk_ordinal !== 'number') return false
  if (!('ocr_page_id' in value) || typeof value.ocr_page_id !== 'string') return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('start_line_index' in value) || typeof value.start_line_index !== 'number') return false
  if (!('end_line_index' in value) || typeof value.end_line_index !== 'number') return false
  if (!('source_order' in value) || typeof value.source_order !== 'number') return false
  return true
}

async function listChunkSources(
  database: SQLocalDrizzle,
  request: StorageRequest,
): Promise<ChunkSourcePage> {
  const input = getPayload(request, request.command, isListOcrLinesInput)
  const total = (
    await database.sql<Record<string, unknown>>(SELECT_CHUNK_SOURCE_COUNT_SQL, input.bookId)
  )[0]?.['COUNT(*)']
  if (typeof total !== 'number') throw new Error('Invalid chunk source count')
  const rows = await database.sql<Record<string, unknown>>(
    SELECT_CHUNK_SOURCES_SQL,
    input.bookId,
    input.limit,
    input.offset,
  )
  if (!Array.isArray(rows)) throw new Error('Invalid chunk sources')

  const sources: ChunkSourceRecord[] = []
  for (const row of rows) {
    if (!isChunkSourceRecord(row)) throw new Error('Invalid chunk sources')
    sources.push(row)
  }
  return { sources, total }
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
