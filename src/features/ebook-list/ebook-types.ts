import type {
  COMMAND,
  EBOOK_STORE_ERROR_MESSAGES,
  OPFS_COMMAND,
  SQLITE_COMMAND,
} from './ebook-consts'

export type Command = (typeof COMMAND)[keyof typeof COMMAND]
export type SQLITECommand = (typeof SQLITE_COMMAND)[keyof typeof SQLITE_COMMAND]
export type OPFSCommand = (typeof OPFS_COMMAND)[keyof typeof OPFS_COMMAND]

// 사용 가능한 전체 명령어
export type EbookStoreCommand = Command | SQLITECommand | OPFSCommand
export type EbookStoreErrorCode = keyof typeof EBOOK_STORE_ERROR_MESSAGES

// Client에게 요청 가능한 명령어
export type EbookClientCommand = Exclude<
  EbookStoreCommand,
  'saveBook' | 'writePdf' | 'readPdf' | 'deletePdf'
>

// Ebook 서재 페이지에서 내릴 수 있는 명령어
export type EbookLibraryCommand = Exclude<EbookClientCommand, 'updateProgress'>
export interface EbookWorkerRequest {
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
  author: string | null
  pdfTitle: string | null
  pdfSubject: string | null
  pdfKeywords: string | null
  publisher: string | null
  pdfSize: number
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
  author: string | null
  pdf_title: string | null
  pdf_subject: string | null
  pdf_keywords: string | null
  publisher: string | null
  pdf_size: number
  page_count: number
  cover_data: Uint8Array | null
  cover_mime: string | null
  cover_status: 'ready' | 'fallback'
  pdf_status: 'available' | 'missing'
  last_page: number | null
  created_at: number
  updated_at: number
}
