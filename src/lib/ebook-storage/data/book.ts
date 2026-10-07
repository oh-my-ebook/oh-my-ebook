export interface BookMetadata {
  author?: string
  keywords?: string
  publisher?: string
  subject?: string
  title: string
}

export type BookAnalysisStatus = 'analyzing' | 'ready' | 'failed'

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
  analysis_status: BookAnalysisStatus
  ocr_completed_at: number | null
  indexed_at: number | null
  created_at: number
  updated_at: number
}
