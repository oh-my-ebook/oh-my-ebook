import type { Database } from '@sqlite.org/sqlite-wasm'
import type {
  AddBookInput,
  ChunkSourceInput,
  OcrLineInput,
  SearchChunkInput,
  SearchChunkQuery,
  SearchIndexChunkInput,
  SearchTermFrequencyInput,
} from '../../ebook-types'
import { InvalidPayloadError } from './ebook-db.worker.error'
import { RESET_INVALID_BOOK_PROGRESS_SQL, SELECT_CHANGES_SQL } from './ebook-db.worker.sql'

export interface UpdateCoverInput {
  id: string
  coverData: ArrayBuffer
  coverMime: 'image/webp' | 'image/png'
}

export interface UpdateProgressInput {
  id: string
  page: number
}

export interface UpdateTitleInput {
  id: string
  title: string
}

export interface PdfWriteInput {
  contentHash: string
  pdfData: ArrayBuffer
}

export interface InitializeOcrPagesInput {
  bookId: string
  pageCount: number
}

export interface StoreOcrPageInput {
  pageId: string
  width: number
  height: number
  lines: readonly OcrLineInput[]
}

export interface StoreSearchIndexInput {
  bookId: string
  chunks: readonly SearchIndexChunkInput[]
}

export interface ListOcrLinesInput {
  bookId: string
  limit: number
  offset: number
}

export interface GetStoredOcrPageInput {
  bookId: string
  pageNumber: number
}

const MAX_SEARCH_CHUNK_RESULTS = 5

export interface WorkerRequest {
  requestId: number
  command: string
  payload?: unknown
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'requestId' in value &&
    typeof value.requestId === 'number' &&
    Number.isSafeInteger(value.requestId) &&
    value.requestId > 0 &&
    'command' in value &&
    typeof value.command === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isBook(book: unknown): book is Record<string, unknown> & { content_hash: string } {
  return (
    typeof book === 'object' &&
    book !== null &&
    'content_hash' in book &&
    isContentHash(book.content_hash)
  )
}

export function isAddBookInput(value: unknown): value is AddBookInput {
  if (!isRecord(value)) return false
  const input = value

  if (!(input.pdfData instanceof ArrayBuffer) || input.pdfData.byteLength === 0) return false
  if (!isContentHash(input.contentHash)) return false
  if (typeof input.fileName !== 'string' || typeof input.title !== 'string') return false
  if (
    !isNullableString(input.author) ||
    !isNullableString(input.pdfTitle) ||
    !isNullableString(input.pdfSubject) ||
    !isNullableString(input.pdfKeywords) ||
    !isNullableString(input.publisher)
  ) {
    return false
  }
  if (
    typeof input.pdfSize !== 'number' ||
    !Number.isSafeInteger(input.pdfSize) ||
    input.pdfSize < 0
  ) {
    return false
  }
  if (
    typeof input.pageCount !== 'number' ||
    !Number.isSafeInteger(input.pageCount) ||
    input.pageCount <= 0
  ) {
    return false
  }
  if (!(input.coverData === null || input.coverData instanceof ArrayBuffer)) return false
  if (!(
    input.coverMime === null ||
    input.coverMime === 'image/webp' ||
    input.coverMime === 'image/png'
  )) {
    return false
  }
  if (!(input.coverStatus === 'ready' || input.coverStatus === 'fallback')) return false

  return true
}

export function isContentHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function isPdfWriteInput(value: unknown): value is PdfWriteInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'contentHash' in value &&
    isContentHash(value.contentHash) &&
    'pdfData' in value &&
    value.pdfData instanceof ArrayBuffer &&
    value.pdfData.byteLength > 0
  )
}

export function isUpdateCoverInput(value: unknown): value is UpdateCoverInput {
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

export function isUpdateProgressInput(value: unknown): value is UpdateProgressInput {
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

export function isUpdateTitleInput(value: unknown): value is UpdateTitleInput {
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

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isOcrLineInput(value: unknown): value is OcrLineInput {
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

export function isInitializeOcrPagesInput(value: unknown): value is InitializeOcrPagesInput {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    typeof value.pageCount === 'number' &&
    Number.isSafeInteger(value.pageCount) &&
    value.pageCount > 0
  )
}

export function isStoreOcrPageInput(value: unknown): value is StoreOcrPageInput {
  return (
    isRecord(value) &&
    isIdentifier(value.pageId) &&
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height) &&
    Array.isArray(value.lines) &&
    value.lines.every(isOcrLineInput)
  )
}

function isChunkSourceInput(value: unknown): value is ChunkSourceInput {
  return (
    isRecord(value) &&
    isIdentifier(value.ocrPageId) &&
    isNonNegativeInteger(value.startLineIndex) &&
    isNonNegativeInteger(value.endLineIndex) &&
    value.endLineIndex >= value.startLineIndex &&
    isNonNegativeInteger(value.sourceOrder)
  )
}

function isSearchChunkInput(value: unknown): value is SearchChunkInput {
  return (
    isRecord(value) &&
    isIdentifier(value.id) &&
    isNonNegativeInteger(value.ordinal) &&
    typeof value.text === 'string' &&
    value.text.trim().length > 0 &&
    isPositiveInteger(value.tokenCount) &&
    Array.isArray(value.sources) &&
    value.sources.every(isChunkSourceInput)
  )
}

function isSearchTermFrequencyInput(value: unknown): value is SearchTermFrequencyInput {
  return (
    isRecord(value) &&
    typeof value.term === 'string' &&
    value.term.trim().length > 0 &&
    isPositiveInteger(value.termFrequency)
  )
}

function isSearchIndexChunkInput(value: unknown): value is SearchIndexChunkInput {
  if (!isSearchChunkInput(value) || !('terms' in value) || !Array.isArray(value.terms)) return false
  if (!value.terms.every(isSearchTermFrequencyInput)) return false
  return new Set(value.terms.map(({ term }) => term)).size === value.terms.length
}

export function isStoreSearchIndexInput(value: unknown): value is StoreSearchIndexInput {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isSearchIndexChunkInput)
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

export function isListOcrLinesInput(value: unknown): value is ListOcrLinesInput {
  return (
    isRecord(value) &&
    isIdentifier(value.bookId) &&
    isPositiveInteger(value.limit) &&
    typeof value.offset === 'number' &&
    Number.isSafeInteger(value.offset) &&
    value.offset >= 0
  )
}

export function isGetStoredOcrPageInput(value: unknown): value is GetStoredOcrPageInput {
  return isRecord(value) && isIdentifier(value.bookId) && isPositiveInteger(value.pageNumber)
}

export function getPayload<T>(
  request: WorkerRequest,
  command: string,
  isValid: (value: unknown) => value is T,
): T {
  if (!isValid(request.payload)) throw new InvalidPayloadError(command)
  return request.payload
}

export function normalizeStoredProgress(
  database: Database,
  id: string,
  book: Record<string, unknown>,
): Record<string, unknown> {
  const pageCount = book.page_count
  const lastPage = book.last_page
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

  database.exec(RESET_INVALID_BOOK_PROGRESS_SQL, {
    bind: [Date.now(), id],
  })
  return { ...book, last_page: 1 }
}

export function isRowAffected(database: Database): boolean {
  return database.selectValue(SELECT_CHANGES_SQL) === 1
}
