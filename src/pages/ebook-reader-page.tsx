import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ErrorAlert } from '@/components/error-alert'
import { Reader } from '@/features/reader/components/reader'
import { BookOpen, RefreshCw } from 'lucide-react'
import {
  type EbookReaderStore,
  useEbookReadingSession,
} from '@/features/reader/hooks/use-ebook-reading-session'

export type { EbookReaderStore }

interface EbookReaderPageProps {
  bookId: string
  store: EbookReaderStore
}

export function EbookReaderPage({ bookId, store }: EbookReaderPageProps) {
  const { retry, saveReadingPosition, state } = useEbookReadingSession(bookId, store)

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner aria-label="책을 불러오는 중" className="size-6" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-svh max-w-4xl items-center px-4 py-8">
        <ErrorAlert
          className="mx-auto max-w-lg p-5"
          description={
            <>
              <p>{state.message}</p>
              <p>잠시 후 다시 시도하거나 책장에서 다른 책을 선택해 주세요.</p>
            </>
          }
          title="책을 불러오지 못했습니다."
        >
          <Button onClick={retry}>
            <RefreshCw data-icon="inline-start" />
            다시 시도
          </Button>
          <a className={buttonVariants({ variant: 'outline' })} href="/">
            <BookOpen data-icon="inline-start" />
            책장으로 이동
          </a>
        </ErrorAlert>
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
