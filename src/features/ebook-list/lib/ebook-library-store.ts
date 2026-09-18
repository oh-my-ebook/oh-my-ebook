import type { AddBookInput } from '../ebook-types'

export interface EbookLibraryStore {
  request(
    command: 'initialize' | 'listBooks' | 'getBook' | 'updateCover',
    payload?: unknown,
  ): Promise<unknown>
  addBook(input: AddBookInput): Promise<unknown>
}
