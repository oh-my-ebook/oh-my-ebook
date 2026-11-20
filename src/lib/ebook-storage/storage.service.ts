import type { EbookStore } from './ebook-store'
import * as database from './adapters/sqlocal/database-connection'
import { createBookRepository } from './book/book.repository'
import { createBookService } from './book/book.service'
import * as opfsPdfFiles from './adapters/opfs/pdf-files'
import { createOcrRepository } from './ocr/ocr.repository'
import { createOcrService } from './ocr/ocr.service'
import { createSearchRepository } from './search/search.repository'
import { createSearchService } from './search/search.service'

export const storageService: EbookStore = {
  ...createBookService(createBookRepository(database), opfsPdfFiles),
  ...createOcrService(createOcrRepository(database)),
  ...createSearchService(createSearchRepository(database)),
  async initialize() {
    await database.initializeDatabase()
  },
  async clearStorage() {
    await database.resetDatabase()
    await opfsPdfFiles.clearPdfFiles()
  },
}
