import { useCallback } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ErrorAlert } from '@/components/error-alert'
import { Reader } from '@/features/reader/components/reader'
import type { StoredOcrPageResult } from '@/features/reader/lib/ocr/page-recognition'
import type { SearchChunks } from '@/features/reader/lib/rag/search-book-chunks'
import { BookOpen, RefreshCw } from 'lucide-react'
import {
  type EbookReaderStore,
  useEbookReadingSession,
} from '@/features/reader/hooks/use-ebook-reading-session'

export type { EbookReaderStore }

function isStoredOcrLine(value: unknown): value is StoredOcrPageResult['lines'][number] {
  if (typeof value !== 'object' || value === null) return false
  if (!('rawText' in value) || typeof value.rawText !== 'string') return false
  if (!('x0' in value) || typeof value.x0 !== 'number') return false
  if (!('y0' in value) || typeof value.y0 !== 'number') return false
  if (!('x1' in value) || typeof value.x1 !== 'number') return false
  if (!('y1' in value) || typeof value.y1 !== 'number') return false
  return true
}

function isStoredOcrPage(value: unknown): value is StoredOcrPageResult {
  if (typeof value !== 'object' || value === null) return false
  if (!('width' in value) || typeof value.width !== 'number') return false
  if (!('height' in value) || typeof value.height !== 'number') return false
  if (!('lines' in value) || !Array.isArray(value.lines)) return false
  return value.lines.every(isStoredOcrLine)
}

interface EbookReaderPageProps {
  bookId: string
  store: EbookReaderStore
}

export function EbookReaderPage({ bookId, store }: EbookReaderPageProps) {
  const { retry, saveReadingPosition, state } = useEbookReadingSession(bookId, store)
  const getStoredOcrPage = useCallback(
    async (pageNumber: number) => {
      const result = await store.request('getStoredOcrPage', { bookId, pageNumber })
      return isStoredOcrPage(result) ? result : null
    },
    [bookId, store],
  )
  const searchChunks = useCallback<SearchChunks>(
    async (query) => await store.request('searchChunks', query),
    [store],
  )

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
          <a className={buttonVariants({ variant: 'outline' })} href="/library">
            <BookOpen data-icon="inline-start" />
            책장으로 이동
          </a>
        </ErrorAlert>
      </main>
    )
  }

  return (
    <Reader
      analysisStatus={state.book.analysisStatus}
      bookMetadata={state.book.metadata}
      bookId={bookId}
      data={state.book.pdfData}
      initialPage={state.book.lastPage ?? 1}
      getStoredOcrPage={getStoredOcrPage}
      onPageChange={saveReadingPosition}
      searchChunks={searchChunks}
      title={state.book.metadata.title}
    />
  )
}
