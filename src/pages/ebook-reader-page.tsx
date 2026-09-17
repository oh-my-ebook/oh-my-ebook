import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Reader } from '@/features/reader/components/reader'
import { BookOpen, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  type EbookReaderStore,
  useEbookReaderBook,
} from '@/features/reader/hooks/use-ebook-reader-book'

export type { EbookReaderStore }

export function EbookReaderPage({ bookId, store }: { bookId: string; store: EbookReaderStore }) {
  const { retry, saveProgress, state } = useEbookReaderBook(bookId, store)

  if (state.status === 'loading') {
    return <p role="status">책을 불러오는 중</p>
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-svh max-w-4xl items-center px-4 py-8">
        <Alert className="mx-auto max-w-lg p-5" variant="destructive">
          <TriangleAlert />
          <AlertTitle>책을 불러오지 못했습니다.</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <p>잠시 후 다시 시도하거나 책장에서 다른 책을 선택해 주세요.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retry}>
                <RefreshCw data-icon="inline-start" />
                다시 시도
              </Button>
              <a className={buttonVariants({ variant: 'outline' })} href="/">
                <BookOpen data-icon="inline-start" />
                책장으로 이동
              </a>
            </div>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <Reader
      data={state.book.pdfData}
      initialPage={state.book.lastPage ?? 1}
      onPageChange={saveProgress}
      title={state.book.title}
    />
  )
}
