import type { AddBookInput, EbookLibraryCommand } from '../ebook-types'

export interface EbookLibraryStore {
  request(command: EbookLibraryCommand, payload?: unknown): Promise<unknown>
  saveBook(input: AddBookInput): Promise<unknown>
}
