import { useNavigate } from 'react-router'
import { ErrorAlert } from '@/components/error-alert'
import { Bookshelf } from '@/features/bookshelf/components/bookshelf'
import { ebookStore } from '@/features/bookshelf/lib/ebook-store'

export function BookshelfPage() {
  const navigate = useNavigate()
  if (!ebookStore) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ErrorAlert title="이 브라우저에서는 로컬 책장을 사용할 수 없습니다." />
      </main>
    )
  }

  return <Bookshelf store={ebookStore} onOpenBook={(bookId) => navigate(`/books/${bookId}`)} />
}
