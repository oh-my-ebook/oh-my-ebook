import type { books } from '../schema'

type BookRow = typeof books.$inferSelect

type BookFields = Pick<
  BookRow,
  | 'contentHash'
  | 'fileName'
  | 'title'
  | 'author'
  | 'pdfTitle'
  | 'pdfSubject'
  | 'pdfKeywords'
  | 'publisher'
  | 'pdfSize'
  | 'pageCount'
>

interface StoredBookBase extends BookRow {
  id: string
}

type StoredBookMetadata = Omit<
  StoredBookBase,
  | 'coverData'
  | 'coverMime'
  | 'coverStatus'
  | 'ocrCompletedAt'
  | 'indexedAt'
  | 'createdAt'
  | 'updatedAt'
>

export interface BookMetadata {
  author?: string
  keywords?: string
  publisher?: string
  subject?: string
  title: string
}

export type BookAnalysisStatus = BookRow['analysisStatus']

export interface AddBookInput extends BookFields {
  pdfData: ArrayBuffer
  coverData: ArrayBuffer | null
  coverMime: 'image/webp' | 'image/png' | null
  coverStatus: BookRow['coverStatus']
}

export interface StoredBook extends StoredBookBase {
  pdfStatus: 'available' | 'missing'
}

export interface StoredBookDetail extends StoredBookMetadata {
  pdfData: Uint8Array
}
