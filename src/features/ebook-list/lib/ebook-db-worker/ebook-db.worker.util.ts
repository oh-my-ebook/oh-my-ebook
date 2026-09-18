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

export function isAddBookInput(value: unknown): value is AddBookInput {
  if (typeof value !== 'object' || value === null) return false
  return (
    'pdfData' in value &&
    value.pdfData instanceof ArrayBuffer &&
    value.pdfData.byteLength > 0 &&
    'contentHash' in value &&
    typeof value.contentHash === 'string' &&
    value.contentHash.trim().length > 0 &&
    'fileName' in value &&
    typeof value.fileName === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'pageCount' in value &&
    Number.isSafeInteger(value.pageCount) &&
    Number(value.pageCount) > 0 &&
    'coverData' in value &&
    (value.coverData === null || value.coverData instanceof ArrayBuffer) &&
    'coverMime' in value &&
    (value.coverMime === null ||
      value.coverMime === 'image/webp' ||
      value.coverMime === 'image/png') &&
    'coverStatus' in value &&
    (value.coverStatus === 'ready' || value.coverStatus === 'fallback')
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
