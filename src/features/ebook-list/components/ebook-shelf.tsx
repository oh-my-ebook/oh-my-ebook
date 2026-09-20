import type { StoredBook } from '../ebook-types'
import { BookCard } from './book-card'

interface EbookShelfProps {
  books: readonly StoredBook[]
  coverErrors: Readonly<Record<string, string>>
  onOpenBook(bookId: string): void
  onRegenerate(book: StoredBook): void
  regeneratingCover: string | null
  onRename(bookId: string, title: string): void
  onDelete(bookId: string): Promise<void>
  onRetryAnalysis?(bookId: string): void
}

export function EbookShelf({
  books,
  coverErrors,
  onOpenBook,
  onRegenerate,
  regeneratingCover,
  onRename,
  onDelete,
  onRetryAnalysis,
}: EbookShelfProps) {
  return (
    <ul className="ebook-shelf" role="list">
      {books.map((book) => (
        <li key={book.id}>
          <BookCard
            book={book}
            coverError={coverErrors[book.id]}
            onOpen={() => onOpenBook(book.id)}
            onRename={(title) => onRename(book.id, title)}
            onDelete={() => onDelete(book.id)}
            onRegenerate={() => onRegenerate(book)}
            onRetryAnalysis={onRetryAnalysis ? () => onRetryAnalysis(book.id) : undefined}
            regenerating={regeneratingCover === book.id}
          />
        </li>
      ))}
    </ul>
  )
}
