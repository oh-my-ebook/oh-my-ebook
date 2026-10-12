import type { DatabaseConnection } from './database-connection'
import type {
  ImportedBook,
  BookAnalysisStatus,
  BookPageMetadata,
  BookRecordsQuery,
  BookCover,
  BookProgress,
  BookTitle,
} from './types/book'
import type { OcrLine, OcrPageQuery, OcrPageResult } from './types/ocr'
import type { SearchChunkQuery } from './types/search'
import type {
  ChunkSource,
  SearchChunkWithSources,
  IndexedSearchChunk,
  SearchTermFrequency,
  SearchIndex,
} from './types/search-index'
import { eq } from 'drizzle-orm'
import { books } from './schema'
import { InvalidDataError } from './storage-errors'

const MAX_SEARCH_CHUNK_RESULTS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isImportedBook(value: unknown): value is ImportedBook {
  if (!isRecord(value)) return false
  const book = value

  if (!(book.pdfData instanceof ArrayBuffer) || book.pdfData.byteLength === 0) return false
  if (!isContentHash(book.contentHash)) return false
  if (typeof book.fileName !== 'string' || typeof book.title !== 'string') return false
  if (
    !isNullableString(book.author) ||
    !isNullableString(book.pdfTitle) ||
    !isNullableString(book.pdfSubject) ||
    !isNullableString(book.pdfKeywords) ||
    !isNullableString(book.publisher)
  ) {
    return false
  }
  if (typeof book.pdfSize !== 'number' || !Number.isSafeInteger(book.pdfSize) || book.pdfSize < 0) {
    return false
  }
  if (
    typeof book.pageCount !== 'number' ||
    !Number.isSafeInteger(book.pageCount) ||
    book.pageCount <= 0
  ) {
    return false
  }
  if (!(book.coverData === null || book.coverData instanceof ArrayBuffer)) return false
  if (!(
    book.coverMime === null ||
    book.coverMime === 'image/webp' ||
    book.coverMime === 'image/png'
  )) {
    return false
  }
  if (!(book.coverStatus === 'ready' || book.coverStatus === 'fallback')) return false

  return true
}

export function isContentHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function isBookCover(value: unknown): value is BookCover {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'coverData' in value &&
    value.coverData instanceof ArrayBuffer &&
    'coverMime' in value &&
    (value.coverMime === 'image/webp' || value.coverMime === 'image/png')
  )
}

export function isBookProgress(value: unknown): value is BookProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'page' in value &&
    typeof value.page === 'number' &&
    Number.isSafeInteger(value.page) &&
    value.page > 0
  )
}

export function isBookTitle(value: unknown): value is BookTitle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'title' in value &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0
  )
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isOcrLine(value: unknown): value is OcrLine {
  if (!isRecord(value)) return false
  return (
    typeof value.rawText === 'string' &&
    typeof value.x0 === 'number' &&
    Number.isFinite(value.x0) &&
    typeof value.y0 === 'number' &&
    Number.isFinite(value.y0) &&
    typeof value.x1 === 'number' &&
    Number.isFinite(value.x1) &&
    value.x1 > value.x0 &&
    typeof value.y1 === 'number' &&
    Number.isFinite(value.y1) &&
    value.y1 > value.y0
  )
}

export function isBookPageMetadata(value: unknown): value is BookPageMetadata {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    typeof value.pageCount === 'number' &&
    Number.isSafeInteger(value.pageCount) &&
    value.pageCount > 0
  )
}

export function isOcrPageResult(value: unknown): value is OcrPageResult {
  return (
    isRecord(value) &&
    isIdentifier(value.pageId) &&
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height) &&
    Array.isArray(value.lines) &&
    value.lines.every(isOcrLine)
  )
}

function isChunkSource(value: unknown): value is ChunkSource {
  return (
    isRecord(value) &&
    isIdentifier(value.ocrPageId) &&
    isNonNegativeInteger(value.startLineIndex) &&
    isNonNegativeInteger(value.endLineIndex) &&
    value.endLineIndex >= value.startLineIndex &&
    isNonNegativeInteger(value.sourceOrder)
  )
}

function isSearchChunkWithSources(value: unknown): value is SearchChunkWithSources {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isNonNegativeInteger(value.ordinal) &&
    typeof value.text === 'string' &&
    value.text.trim().length > 0 &&
    isPositiveInteger(value.tokenCount) &&
    Array.isArray(value.sources) &&
    value.sources.every(isChunkSource)
  )
}

function isSearchTermFrequency(value: unknown): value is SearchTermFrequency {
  return (
    isRecord(value) &&
    typeof value.term === 'string' &&
    value.term.trim().length > 0 &&
    isPositiveInteger(value.termFrequency)
  )
}

function isIndexedSearchChunk(value: unknown): value is IndexedSearchChunk {
  if (!isSearchChunkWithSources(value) || !('terms' in value) || !Array.isArray(value.terms))
    return false
  if (!value.terms.every(isSearchTermFrequency)) return false
  return new Set(value.terms.map(({ term }) => term)).size === value.terms.length
}

export function isSearchIndex(value: unknown): value is SearchIndex {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isIndexedSearchChunk)
  )
}

function isSearchTerm(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim() === value
}

export function isSearchChunkQuery(value: unknown): value is SearchChunkQuery {
  if (!isRecord(value)) return false
  if (!isIdentifier(value.bookId)) return false
  if (!Array.isArray(value.terms)) return false
  if (!value.terms.every(isSearchTerm)) return false
  if (new Set(value.terms).size !== value.terms.length) return false
  return isPositiveInteger(value.limit) && value.limit <= MAX_SEARCH_CHUNK_RESULTS
}

export function isBookRecordsQuery(value: unknown): value is BookRecordsQuery {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    isPositiveInteger(value.limit) &&
    typeof value.offset === 'number' &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0
  )
}

export function isOcrPageQuery(value: unknown): value is OcrPageQuery {
  return isRecord(value) && isIdentifier(value.bookId) && isPositiveInteger(value.pageNumber)
}

export function validateData<T>(
  data: T,
  operation: string,
  isValid: (value: unknown) => value is T,
): void {
  if (!isValid(data)) throw new InvalidDataError(operation)
}

export function isBookAnalysisStatus(value: unknown): value is BookAnalysisStatus {
  return value === 'analyzing' || value === 'ready' || value === 'failed'
}

export async function normalizeStoredProgress<
  T extends { pageCount: number; lastPage: number | null },
>(database: Pick<DatabaseConnection, 'db'>, id: string, book: T): Promise<T> {
  const pageCount = book.pageCount
  const lastPage = book.lastPage
  if (
    lastPage === null ||
    (typeof pageCount === 'number' &&
      Number.isSafeInteger(pageCount) &&
      pageCount > 0 &&
      typeof lastPage === 'number' &&
      Number.isSafeInteger(lastPage) &&
      lastPage >= 1 &&
      lastPage <= pageCount)
  ) {
    return book
  }

  await database.db
    .update(books)
    .set({ lastPage: 1, updatedAt: Date.now() })
    .where(eq(books.id, id))
  return { ...book, lastPage: 1 }
}

export async function runValidated<Data, Result>(
  name: string,
  operation: (data: Data) => Promise<Result>,
  data: Data,
  isValid: (value: unknown) => value is Data,
): Promise<Result> {
  validateData(data, name, isValid)
  const operationResult = await operation(data)
  return operationResult
}
