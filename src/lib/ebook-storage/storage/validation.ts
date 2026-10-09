import type { EbookStore } from '../ebook-store'
import { eq } from 'drizzle-orm'
import type { DatabaseConnection } from './database-connection'
import type { AddBookInput, BookAnalysisStatus } from '../types/book'
import type { OcrLineInput } from '../types/ocr'
import type { SearchChunkQuery } from '../types/search'
import type {
  ChunkSourceInput,
  SearchChunkInput,
  SearchIndexChunkInput,
  SearchTermFrequencyInput,
} from '../types/search-index'
import { books } from '../schema'
import { InvalidInputError } from './errors'

import type {
  GetStoredOcrPageInput,
  InitializeOcrPagesInput,
  ListOcrLinesInput,
  StoreOcrPageInput,
  StoreSearchIndexInput,
  UpdateCoverInput,
  UpdateProgressInput,
  UpdateTitleInput,
} from '../types/inputs'

const MAX_SEARCH_CHUNK_RESULTS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
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

export function isIdentifier(value: unknown): value is string {
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

export function validateInput<T>(
  input: T,
  operation: string,
  isValid: (value: unknown) => value is T,
): void {
  if (!isValid(input)) throw new InvalidInputError(operation)
}

export function isBookAnalysisStatus(value: unknown): value is BookAnalysisStatus {
  return value === 'analyzing' || value === 'ready' || value === 'failed'
}

export async function normalizeStoredProgress<
  T extends { page_count: number; last_page: number | null },
>(database: Pick<DatabaseConnection, 'db'>, id: string, book: T): Promise<T> {
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

  await database.db
    .update(books)
    .set({ lastPage: 1, updatedAt: Date.now() })
    .where(eq(books.id, id))
  return { ...book, last_page: 1 }
}

export async function runValidated<Input, Result>(
  name: keyof EbookStore,
  operation: (input: Input) => Promise<Result>,
  input: Input,
  isValid: (value: unknown) => value is Input,
): Promise<Result> {
  validateInput(input, name, isValid)
  return await operation(input)
}
