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
import { toast } from '@/components/ui/toast'
import { useEbookLibrary, type EbookLibraryStore } from '../hooks/use-ebook-library'
import { EbookStoreError } from '../lib/ebook-store-client'
import { EbookShelf } from './ebook-shelf'
import { EbookShelfLoading } from './ebook-shelf-loading'
import { LibrarySummary } from './library-summary'
import { PdfUpload } from './pdf-upload'

interface EbookLibraryProps {
  store: EbookLibraryStore
  onOpenBook?(bookId: string): void
}

export function EbookLibrary({ onOpenBook, store }: EbookLibraryProps) {
  const {
    state,
    retry,
    refreshLibrary,
    refreshError,
    refreshing,
    usage,
    isUploading,
    addFiles,
    regenerateCover,
    coverErrors,
    regeneratingCover,
    renameBook,
    deleteBook,
  } = useEbookLibrary(store)

  async function openBook(bookId: string) {
    try {
      await store.request('hasBook', bookId)
      onOpenBook?.(bookId)
    } catch (error) {
      toast.add({
        title: error instanceof EbookStoreError ? error.message : '책을 열지 못했습니다.',
        type: 'error',
      })
      if (error instanceof EbookStoreError && error.code === 'deleted') {
        void refreshLibrary()
      }
    }
  }

  return (
    <main className="min-h-svh bg-background">
      <nav aria-label="주 탐색" className="border-b bg-card/92">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6 lg:px-10">
          <strong>oh-my-ebook</strong>
          <span className="h-4 border-l" />
          <span className="rounded bg-muted px-3 py-1 text-sm">내 서재</span>
        </div>
      </nav>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6 border-b pb-8 max-[560px]:grid-cols-1 max-[560px]:items-start">
          <div className="flex min-w-0 flex-col gap-1 [&>p]:wrap-break-word">
            <p className="text-xs text-muted-foreground">이 브라우저에만 보관되는 오프라인 서재</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight">내 서재</h1>
            <p className="text-muted-foreground">
              저장한 PDF를 다시 열고 읽던 위치에서 이어 보세요.
            </p>
          </div>
          <div className="flex items-center gap-2 max-[560px]:row-start-2 max-[560px]:flex-wrap">
            {state.status === 'ready' && <LibrarySummary books={state.books} usage={usage} />}
            <Button
              disabled={state.status !== 'ready' || refreshing}
              onClick={() => {
                void refreshLibrary()
              }}
              variant="outline"
            >
              새로고침
            </Button>
            <PdfUpload
              isUploading={isUploading}
              disabled={state.status !== 'ready'}
              onFilesSelected={(files) => {
                void addFiles(files)
              }}
            />
          </div>
        </header>
        {state.status === 'loading' && <EbookShelfLoading />}

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
                PDF는 이 브라우저에만 저장됩니다. 브라우저 데이터를 삭제하면 책도 사라질 수
                있습니다.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>위의 PDF 업로드 버튼으로 책을 선택하세요.</EmptyContent>
          </Empty>
        )}

        {state.status === 'ready' && state.books.length > 0 && (
          <section aria-label="저장된 책" className="flex flex-col gap-3">
            <p>저장된 책 {state.books.length}권</p>
            <EbookShelf
              books={state.books}
              coverErrors={coverErrors}
              onOpenBook={(bookId) => {
                void openBook(bookId)
              }}
              onRegenerate={(book) => {
                void regenerateCover(book)
              }}
              regeneratingCover={regeneratingCover}
              onDelete={(bookId) => {
                return deleteBook(bookId)
              }}
              onRename={(bookId, title) => {
                void renameBook(bookId, title)
              }}
            />
          </section>
        )}
        {refreshError && (
          <Alert variant="destructive">
            <AlertTitle>{refreshError}</AlertTitle>
            <AlertDescription>
              <Button
                className="mt-3"
                onClick={() => {
                  void refreshLibrary()
                }}
                variant="outline"
              >
                다시 시도
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {state.status === 'ready' && (
          <p className="text-sm text-muted-foreground">
            PDF는 서버나 다른 기기에 동기화되지 않습니다.
          </p>
        )}
      </div>
    </main>
  )
}
