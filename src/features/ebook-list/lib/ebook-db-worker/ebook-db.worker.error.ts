import type { EbookStoreErrorCode } from '../../ebook-types'

export class UnsupportedStorageError extends Error {}
export class NotFoundBookError extends Error {}
export class DuplicateBookError extends Error {}
export class DeletedBookError extends Error {}
export class InvalidPayloadError extends Error {
  constructor(command: string) {
    super(`Invalid payload for ${command}`)
  }
}
export class UnsupportedCommandError extends Error {
  constructor(command: string) {
    super(`Unsupported command: ${command}`)
  }
}

export function getErrorCode(error: unknown): EbookStoreErrorCode {
  if (error instanceof UnsupportedStorageError) return 'unsupported'
  if (error instanceof NotFoundBookError) return 'notfound'
  if (error instanceof DuplicateBookError) return 'duplicate'
  if (error instanceof DeletedBookError) return 'deleted'
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    if (error.resultCode === 5 || error.resultCode === 6) return 'locked'
    if (error.resultCode === 13) return 'quota'
  }
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: books.content_hash')
  ) {
    return 'duplicate'
  }
  return 'storage-failed'
}
