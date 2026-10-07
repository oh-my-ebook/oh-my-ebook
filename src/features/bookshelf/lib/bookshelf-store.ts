import type { AddBookInput, BookshelfCommand } from '../ebook-types'

export interface BookshelfStore {
  request(command: BookshelfCommand, payload?: unknown): Promise<unknown>
  saveBook(input: AddBookInput): Promise<unknown>
}
