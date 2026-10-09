import type { OcrLineInput } from './ocr'
import type { SearchIndexChunkInput } from './search-index'

export interface UpdateCoverInput {
  id: string
  coverData: ArrayBuffer
  coverMime: 'image/webp' | 'image/png'
}

export interface UpdateProgressInput {
  id: string
  page: number
}

export interface UpdateTitleInput {
  id: string
  title: string
}

export interface InitializeOcrPagesInput {
  bookId: string
  pageCount: number
}

export interface StoreOcrPageInput {
  pageId: string
  width: number
  height: number
  lines: readonly OcrLineInput[]
}

export interface StoreSearchIndexInput {
  bookId: string
  chunks: readonly SearchIndexChunkInput[]
}

export interface ListOcrLinesInput {
  bookId: string
  limit: number
  offset: number
}

export interface GetStoredOcrPageInput {
  bookId: string
  pageNumber: number
}
