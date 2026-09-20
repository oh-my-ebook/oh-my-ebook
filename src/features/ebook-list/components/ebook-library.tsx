import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { ErrorAlert } from '@/components/error-alert'
import { useState } from 'react'
import { useEbookLibrary, type EbookLibraryStore } from '../hooks/use-ebook-library'
import { clearOriginData } from '../lib/origin-data-manager'
import { usePageFileDrop } from '../hooks/use-page-file-drop'
import { EbookStoreError } from '../lib/ebook-store-client'
import { EbookShelf } from './ebook-shelf'
import { EbookShelfLoading } from './ebook-shelf-loading'
import { LibrarySummary } from './library-summary'
import { ClearOriginDataDialog } from './clear-origin-data-dialog'

interface EbookLibraryProps {
  store: EbookLibraryStore
  onOpenBook?(bookId: string): void
}

export function EbookLibrary({ onOpenBook, store }: EbookLibraryProps) {
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
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
    retryOcrAnalysis,
  } = useEbookLibrary(store)

  const { isDraggingFile, dropZoneProps } = usePageFileDrop({
    disabled: state.status !== 'ready' || isUploading,
    onFilesDropped: (files) => {
      void addFiles(files)
    },
  })

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

  async function clearAllData() {
    await store.request('clearStorage')
    await clearOriginData()
    window.location.reload()
  }

  return (
    <main className="min-h-svh bg-background" {...dropZoneProps}>
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
            <Button
              disabled={state.status !== 'ready'}
              onClick={() => setClearDialogOpen(true)}
              variant="outline"
            >
              저장소 관리
            </Button>
          </div>
        </header>
        {state.status === 'loading' && <EbookShelfLoading />}

        {state.status === 'error' && (
          <ErrorAlert title={state.message}>
            <Button onClick={retry}>다시 시도</Button>
          </ErrorAlert>
        )}

        {state.status === 'ready' && (
          <section aria-label="저장된 책" className="flex flex-col gap-3">
            {state.books.length > 0 && <p>저장된 책 {state.books.length}권</p>}
            <EbookShelf
              books={state.books}
              coverErrors={coverErrors}
              disabled={state.status !== 'ready'}
              dragActive={isDraggingFile}
              isUploading={isUploading}
              onFilesSelected={(files) => {
                void addFiles(files)
              }}
              onOpenBook={(bookId) => {
                void openBook(bookId)
              }}
              onRegenerate={(book) => {
                void regenerateCover(book)
              }}
              onRetryAnalysis={(bookId) => {
                void retryOcrAnalysis(bookId)
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
          <ErrorAlert title={refreshError}>
            <Button
              onClick={() => {
                void refreshLibrary()
              }}
            >
              다시 시도
            </Button>
          </ErrorAlert>
        )}
        {state.status === 'ready' && (
          <p className="text-sm text-muted-foreground">
            PDF는 서버나 다른 기기에 동기화되지 않습니다.
          </p>
        )}
      </div>
      <ClearOriginDataDialog
        onClear={clearAllData}
        onOpenChange={setClearDialogOpen}
        open={clearDialogOpen}
      />
    </main>
  )
}
