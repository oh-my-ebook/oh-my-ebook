import type { InferModelFromColumns } from 'drizzle-orm'
import type { bookFileColumns, bookDetailsColumns, booksTable } from '../schema/book'

export type { BookAnalysisStatus } from '../schema/book'

export type Book = typeof booksTable.$inferSelect
export type InsertBook = typeof booksTable.$inferInsert

export type BookInfo = Pick<Book, 'title' | 'author' | 'pdfKeywords' | 'publisher' | 'pdfSubject'>

// 파일 API의 ArrayBuffer는 저장 경계에서 SQLite용 Uint8Array로 변환한다.
export interface BookFileData extends Pick<Book, keyof typeof bookFileColumns | 'coverMime'> {
  pdfData: ArrayBuffer
  coverData: ArrayBuffer | null
}

export interface BookCover {
  coverData: ArrayBuffer
  coverMime: NonNullable<Book['coverMime']>
}

export interface BookListItem extends Book {
  pdfStatus: 'available' | 'missing'
}

export interface BookDocument extends InferModelFromColumns<typeof bookDetailsColumns> {
  pdfData: Uint8Array
}
