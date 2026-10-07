import { EBOOK_STORE_ERROR_MESSAGES } from './ebook-consts'
import type { EbookStoreErrorCode } from './ebook-types'

export function isEbookStoreErrorCode(value: unknown): value is EbookStoreErrorCode {
  return typeof value === 'string' && Object.hasOwn(EBOOK_STORE_ERROR_MESSAGES, value)
}
