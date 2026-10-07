import type { AddBookInput, EbookClientCommand } from '@/lib/ebook/storage/protocol'

export type BookshelfCommand = Exclude<EbookClientCommand, 'updateProgress'>

export interface BookshelfStore {
  request(command: BookshelfCommand, payload?: unknown): Promise<unknown>
  saveBook(input: AddBookInput): Promise<unknown>
}
