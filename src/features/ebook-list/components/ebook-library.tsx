import { BookOpen } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { useEbookLibrary, type EbookLibraryStore } from '../hooks/use-ebook-library'

interface EbookLibraryProps {
  store: EbookLibraryStore
}

export function EbookLibrary({ store }: EbookLibraryProps) {
  const { state, retry } = useEbookLibrary(store)

  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">내 책장</h1>
        <div className="flex gap-2">
          <Button disabled={state.status !== 'ready'} onClick={retry} variant="outline">
            새로고침
          </Button>
          <Button disabled>PDF 추가</Button>
        </div>
      </header>

      {state.status === 'loading' && (
        <div aria-label="책장 불러오는 중" className="flex flex-col gap-3" role="status">
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="destructive">
          <AlertTitle>{state.message}</AlertTitle>
          <AlertDescription>
            <Button className="mt-3" onClick={retry} variant="outline">
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === 'ready' && state.books.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>아직 저장한 책이 없습니다.</EmptyTitle>
            <EmptyDescription>
              PDF는 이 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하면 책도 사라질 수 있습니다.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>PDF 추가 기능을 준비 중입니다.</EmptyContent>
        </Empty>
      )}

      {state.status === 'ready' && state.books.length > 0 && (
        <p>저장된 책 {state.books.length}권</p>
      )}
    </main>
  )
}
