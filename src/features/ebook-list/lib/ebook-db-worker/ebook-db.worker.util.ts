import type { Database } from '@sqlite.org/sqlite-wasm'
import type { AddBookInput } from '../../ebook-types'
import { InvalidPayloadError } from './ebook-db.worker.error'

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

export function isAddBookInput(value: unknown): value is AddBookInput {
  if (!isRecord(value)) return false
  const input = value

  if (!(input.pdfData instanceof ArrayBuffer) || input.pdfData.byteLength === 0) return false
  if (typeof input.contentHash !== 'string' || input.contentHash.trim().length === 0) return false
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

  database.exec('UPDATE books SET last_page = 1, updated_at = ? WHERE id = ?', {
    bind: [Date.now(), id],
  })
  return { ...book, last_page: 1 }
}

export function isRowAffected(database: Database): boolean {
  return database.selectValue('SELECT changes()') === 1
}
