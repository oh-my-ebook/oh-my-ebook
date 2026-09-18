import type { AddBookInput } from '../ebook-types'

export interface EbookLibraryStore {
  request(
    command:
      | 'initialize'
      | 'listBooks'
      | 'hasBook'
      | 'getBook'
      | 'updateCover'
      | 'updateTitle'
      | 'deleteBook',
    payload?: unknown,
  ): Promise<unknown>
  addBook(input: AddBookInput): Promise<unknown>
}
