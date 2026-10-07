import type { AddBookInput } from '@/lib/ebook-storage/data/book'
import type { EbookClientCommand } from '@/lib/ebook-storage/commands'

export type BookshelfCommand = Exclude<EbookClientCommand, 'updateProgress'>

export interface BookshelfStore {
  request(command: BookshelfCommand, payload?: unknown): Promise<unknown>
  saveBook(input: AddBookInput): Promise<unknown>
}
