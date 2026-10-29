import type { BookFileData, BookAnalysisStatus } from './types/book'
import type { OcrLineContent, OcrPageQuery, OcrPageResult } from './types/ocr'
import type {
  SearchChunkQuery,
  ChunkSourceRange,
  SearchChunkWithSources,
  IndexedSearchChunk,
  SearchTermFrequency,
  SearchIndex,
} from './types/search'
import { InvalidDataError } from './storage-errors'
import { bookAnalysisStatuses, bookCoverMimeTypes } from './schema/book'

const MAX_SEARCH_CHUNK_RESULTS = 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isBookFileData(value: unknown): value is BookFileData {
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
  if (book.coverMime !== null && !bookCoverMimeTypes.some((mime) => mime === book.coverMime)) {
    return false
  }

  return true
}

export function isContentHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
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

function isLineContent(value: unknown): value is OcrLineContent {
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

export function isOcrPageResult(value: unknown): value is OcrPageResult {
  return (
    isRecord(value) &&
    isIdentifier(value.pageId) &&
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height) &&
    Array.isArray(value.lines) &&
    value.lines.every(isLineContent)
  )
}

function isSourceRange(value: unknown): value is ChunkSourceRange {
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
    value.sources.every(isSourceRange)
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
  return bookAnalysisStatuses.some((status) => status === value)
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
