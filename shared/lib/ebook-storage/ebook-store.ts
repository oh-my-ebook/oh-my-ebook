import type { BookService } from './book/book.service'
import type { OcrService } from './ocr/ocr.service'
import type { SearchService } from './search/search.service'

export interface EbookStore extends BookService, OcrService, SearchService {
  initialize(): Promise<void>
  clearStorage(): Promise<void>
}
