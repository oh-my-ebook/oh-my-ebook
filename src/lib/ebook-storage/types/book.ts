import type { books } from '../schema'

type BookRow = typeof books.$inferSelect

export interface BookMetadata {
  author?: string
  keywords?: string
  publisher?: string
  subject?: string
  title: string
}

export type BookAnalysisStatus = BookRow['analysisStatus']

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

export interface StoredBook extends Omit<BookRow, 'id'> {
  id: string
  pdfStatus: 'available' | 'missing'
}

export interface StoredBookDetail extends Pick<
  StoredBook,
  | 'id'
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
  | 'lastPage'
  | 'analysisStatus'
> {
  pdfData: Uint8Array
}
