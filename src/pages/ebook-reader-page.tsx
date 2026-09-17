import { Alert, AlertTitle } from '@/components/ui/alert'
import { Reader } from '@/features/reader/components/reader'
import {
  type EbookReaderStore,
  useEbookReadingSession,
} from '@/features/reader/hooks/use-ebook-reading-session'

export type { EbookReaderStore }

export function EbookReaderPage({ bookId, store }: { bookId: string; store: EbookReaderStore }) {
  const { saveReadingPosition, state } = useEbookReadingSession(bookId, store)

  if (state.status === 'loading') {
    return <p role="status">책을 불러오는 중</p>
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>{state.message}</AlertTitle>
        </Alert>
      </main>
    )
  }

  return (
    <Reader
      data={state.book.pdfData}
      initialPage={state.book.lastPage ?? 1}
      onPageChange={saveReadingPosition}
      title={state.book.title}
    />
  )
}
