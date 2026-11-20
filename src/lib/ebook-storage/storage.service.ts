import type { EbookStore } from '@shared/lib/ebook-storage/ebook-store'
import { createBookService } from '@shared/lib/ebook-storage/book/book.service'
import { createOcrService } from '@shared/lib/ebook-storage/ocr/ocr.service'
import { createSearchService } from '@shared/lib/ebook-storage/search/search.service'
import * as opfsPdfFiles from './adapters/opfs/pdf-files'
import * as database from './adapters/sqlocal/database-connection'
import { createBookRepository } from './adapters/sqlocal/book.repository'
import { createOcrRepository } from './adapters/sqlocal/ocr.repository'
import { createSearchRepository } from './adapters/sqlocal/search.repository'

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
