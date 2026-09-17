import { useEffect, useRef } from 'react'
import { BookOpen } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import type { StoredBook } from '../ebook-types'
import { useEbookLibrary, type EbookLibraryStore } from '../hooks/use-ebook-library'
import { PdfUpload } from './pdf-upload'
import { StorageSummary } from './storage-summary'

interface EbookLibraryProps {
  store: EbookLibraryStore
}

export function EbookLibrary({ store }: EbookLibraryProps) {
  const {
    state,
    retry,
    capacity,
    refreshCapacity,
    items,
    busy,
    persistentStorage,
    requestPersistence,
    addFiles,
    regenerateCover,
    coverErrors,
    regeneratingCover,
  } = useEbookLibrary(store)

  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold">내 책장</h1>
        <div className="flex gap-2">
          <Button disabled={state.status !== 'ready'} onClick={retry} variant="outline">
            새로고침
          </Button>
          <PdfUpload
            busy={busy}
            disabled={state.status !== 'ready'}
            items={items}
            onFilesSelected={(files) => {
              void addFiles(files)
            }}
          />
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
          <EmptyContent>위의 PDF 추가 버튼으로 책을 선택하세요.</EmptyContent>
        </Empty>
      )}

      {state.status === 'ready' && state.books.length > 0 && (
        <section aria-label="저장된 책" className="flex flex-col gap-3">
          <p>저장된 책 {state.books.length}권</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {state.books.map((book) => (
              <li key={book.id}>
                <BookPreview
                  book={book}
                  coverError={coverErrors[book.id]}
                  regenerating={regeneratingCover === book.id}
                  onRegenerate={() => {
                    void regenerateCover(book)
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {state.status === 'ready' && (
        <>
          <StorageSummary
            capacity={capacity}
            persistentStorage={persistentStorage}
            onRequestPersistence={requestPersistence}
            onRetry={() => {
              void refreshCapacity()
            }}
          />
          <p>PDF는 서버나 다른 기기에 동기화되지 않습니다.</p>
        </>
      )}
    </main>
  )
}

function BookPreview({
  book,
  coverError,
  regenerating,
  onRegenerate,
}: {
  book: StoredBook
  coverError?: string
  regenerating: boolean
  onRegenerate(): void
}) {
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!book.cover_data || !book.cover_mime) return
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(book.cover_data)], { type: book.cover_mime }),
    )
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [book.cover_data, book.cover_mime])

  return (
    <Card>
      <CardHeader>
        <CardTitle title={book.title}>{book.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {book.cover_data && book.cover_mime ? (
          <img ref={imageRef} alt={`${book.title} 표지`} className="max-h-64 object-contain" />
        ) : (
          <p>기본 표지</p>
        )}
        <p>지은이: {book.author ?? '정보 없음'}</p>
        <p>출판사: {book.publisher ?? '정보 없음'}</p>
        <p>전체 {book.page_count}페이지</p>
        {book.cover_status === 'fallback' && (
          <>
            <p>표지를 만들지 못했습니다.</p>
            <Button disabled={regenerating} onClick={onRegenerate} variant="outline">
              표지 다시 만들기
            </Button>
            {coverError && <p role="alert">{coverError}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
