import type { BookService } from './storage/book/book.service'
import type { OcrService } from './storage/ocr/ocr.service'
import type { SearchService } from './storage/search/search.service'

export interface EbookStore extends BookService, OcrService, SearchService {
  initialize(): Promise<void>
  clearStorage(): Promise<void>
}
