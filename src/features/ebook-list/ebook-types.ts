import type { EBOOK_STORE_ERROR_MESSAGES, OPFS_COMMAND, SQLITE_COMMAND } from './ebook-consts'

export type EbookStoreCommand =
  | (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]
  | (typeof OPFS_COMMAND)[keyof typeof OPFS_COMMAND]
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
  contentHash: string
  fileName: string
  title: string
  pageCount: number
  coverData: ArrayBuffer | null
  coverMime: 'image/webp' | 'image/png' | null
  coverStatus: 'ready' | 'fallback'
}

export interface StoredBook {
  id: string
  content_hash: string
  file_name: string
  title: string
  page_count: number
  cover_data: Uint8Array | null
  cover_mime: string | null
  cover_status: 'ready' | 'fallback'
  last_page: number | null
  created_at: number
  updated_at: number
}
