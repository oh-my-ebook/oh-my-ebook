import { defineRelations } from 'drizzle-orm'
import { booksTable } from './book'
import { ocrLinesTable, ocrPagesTable } from './ocr'
import {
  chunkSourcesTable,
  searchChunksTable,
  searchPostingsTable,
  searchTermsTable,
} from './search'

export const relations = defineRelations(
  {
    booksTable,
    ocrPagesTable,
    ocrLinesTable,
    searchChunksTable,
    chunkSourcesTable,
    searchTermsTable,
    searchPostingsTable,
  },
  (r) => ({
    ocrPagesTable: {
      lines: r.many.ocrLinesTable({
        from: r.ocrPagesTable.id,
        to: r.ocrLinesTable.ocrPageId,
      }),
    },
    ocrLinesTable: {
      page: r.one.ocrPagesTable({
        from: r.ocrLinesTable.ocrPageId,
        to: r.ocrPagesTable.id,
      }),
    },
    searchTermsTable: {
      postings: r.many.searchPostingsTable({
        from: r.searchTermsTable.id,
        to: r.searchPostingsTable.termId,
      }),
    },
    searchPostingsTable: {
      chunk: r.one.searchChunksTable({
        from: r.searchPostingsTable.chunkId,
        to: r.searchChunksTable.id,
        optional: false,
      }),
    },
  }),
)
