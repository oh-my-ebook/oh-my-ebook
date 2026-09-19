import type { StoredBook } from '../ebook-types'
import { AddBookCard } from './add-book-card'
import { BookCard } from './book-card'

interface EbookShelfProps {
  books: readonly StoredBook[]
  coverErrors: Readonly<Record<string, string>>
  disabled?: boolean
  dragActive?: boolean
  isUploading?: boolean
  onFilesSelected(files: File[]): void
  onOpenBook(bookId: string): void
  onRegenerate(book: StoredBook): void
  regeneratingCover: string | null
  onRename(bookId: string, title: string): void
  onDelete(bookId: string): Promise<void>
}

export function EbookShelf({
  books,
  coverErrors,
  disabled,
  dragActive,
  isUploading,
  onFilesSelected,
  onOpenBook,
  onRegenerate,
  regeneratingCover,
  onRename,
  onDelete,
}: EbookShelfProps) {
  return (
    <ul className="ebook-shelf" role="list">
      <li>
        <AddBookCard
          disabled={disabled}
          dragActive={dragActive}
          isUploading={isUploading}
          onFilesSelected={onFilesSelected}
        />
      </li>
      {books.map((book) => (
        <li key={book.id}>
          <BookCard
            book={book}
            coverError={coverErrors[book.id]}
            onOpen={() => onOpenBook(book.id)}
            onRename={(title) => onRename(book.id, title)}
            onDelete={() => onDelete(book.id)}
            onRegenerate={() => onRegenerate(book)}
            regenerating={regeneratingCover === book.id}
          />
        </li>
      ))}
    </ul>
  )
}
