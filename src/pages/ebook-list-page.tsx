import { useNavigate } from 'react-router'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { EbookLibrary } from '@/features/ebook-list/components/ebook-library'
import { ebookStore } from '@/features/ebook-list/lib/ebook-store'

export function EbookListPage() {
  const navigate = useNavigate()
  if (!ebookStore) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>이 브라우저에서는 로컬 책장을 사용할 수 없습니다.</AlertTitle>
        </Alert>
      </main>
    )
  }

  return <EbookLibrary store={ebookStore} onOpenBook={(bookId) => navigate(`/books/${bookId}`)} />
}
