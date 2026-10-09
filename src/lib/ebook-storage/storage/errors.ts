import { DrizzleQueryError } from 'drizzle-orm'
import type { EbookStoreErrorCode } from '../errors'

export class UnsupportedStorageError extends Error {}
export class NotFoundBookError extends Error {}
export class DuplicateBookError extends Error {}
export class DeletedBookError extends Error {}
export class InvalidInputError extends Error {
  constructor(operation: string) {
    super(`Invalid input for ${operation}`)
  }
}

export function getErrorCode(error: unknown): EbookStoreErrorCode {
  if (error instanceof DrizzleQueryError) return getErrorCode(error.cause)
  if (error instanceof UnsupportedStorageError) return 'unsupported'
  if (error instanceof NotFoundBookError) return 'notfound'
  if (error instanceof DuplicateBookError) return 'duplicate'
  if (error instanceof DeletedBookError) return 'deleted'
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    if (error.resultCode === 5 || error.resultCode === 6) return 'locked'
    if (error.resultCode === 13) return 'quota'
  }
  // Worker가 Error를 복제하면 resultCode 같은 사용자 정의 속성은 사라진다.
  if (error instanceof Error) {
    if (/\bSQLITE_(BUSY|LOCKED)\b|sqlite3 result code (5|6):/.test(error.message)) return 'locked'
    if (/\bSQLITE_FULL\b|sqlite3 result code 13:/.test(error.message)) return 'quota'
  }
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: books.content_hash')
  ) {
    return 'duplicate'
  }
  return 'storage-failed'
}
