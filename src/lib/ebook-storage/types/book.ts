import type { booksTable } from '../schema'

type BookRow = typeof booksTable.$inferSelect

export interface Book extends BookRow {
  id: string
}

type ImportedBookFields = Pick<
  Book,
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
  | 'coverStatus'
>

type StoredBookMetadata = Omit<
  Book,
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

export type BookAnalysisStatus = Book['analysisStatus']

export interface ImportedBook extends ImportedBookFields {
  pdfData: ArrayBuffer
  coverData: ArrayBuffer | null
  coverMime: 'image/webp' | 'image/png' | null
}

export interface StoredBook extends Book {
  pdfStatus: 'available' | 'missing'
}

export interface StoredBookDetail extends StoredBookMetadata {
  pdfData: Uint8Array
}

export interface BookRecordsQuery {
  bookId: Book['id']
  limit: number
  offset: number
}

export interface BookCoverData {
  coverData: ArrayBuffer
  coverMime: 'image/webp' | 'image/png'
}
