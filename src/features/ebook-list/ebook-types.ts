import type { EBOOK_STORE_COMMANDS, EBOOK_STORE_ERROR_MESSAGES } from './ebook-consts'

export type EbookStoreCommand = (typeof EBOOK_STORE_COMMANDS)[keyof typeof EBOOK_STORE_COMMANDS]
export type EbookStoreErrorCode = keyof typeof EBOOK_STORE_ERROR_MESSAGES

export interface EbookStoreRequest {
  requestId: number
  command: EbookStoreCommand
  payload?: unknown
}

export type EbookStoreResponse =
  { requestId: number; result: unknown } | { requestId: number; error: { code: string } }

export interface AddBookInput {
  pdfData: ArrayBuffer
}
