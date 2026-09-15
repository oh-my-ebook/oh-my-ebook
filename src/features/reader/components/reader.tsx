import { useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePdfDocument } from '../hooks/use-pdf-document'
import { useReaderLayout } from '../hooks/use-reader-layout'
import { calculateSinglePageFitScale } from '../lib/reader-state'
import { PdfViewport } from './pdf-viewport'
import { ReaderPanel } from './reader-panel'
import { ReaderToolbar } from './reader-toolbar'

interface ReaderProps {
  url: string
  title?: string
}

interface ReaderErrorProps {
  message: string
  onRetry: () => void
}

interface ReaderLoadingProps {
  label: string
}

function getPdfFilename(url: string) {
  const path = url.split(/[?#]/, 1)[0]
  const filename = path.split('/').filter(Boolean).at(-1)
  if (!filename) {
    return 'PDF 문서'
  }

  try {
    return decodeURIComponent(filename)
  } catch {
    return filename
  }
}

function getReaderTitle(url: string, title?: string) {
  const specifiedTitle = title?.trim()
  return specifiedTitle || getPdfFilename(url)
}

function ReaderLoading({ label }: ReaderLoadingProps) {
  return (
    <div aria-label={label} className="mx-auto h-full max-w-2xl" role="status">
      <Skeleton className="h-full w-full" />
    </div>
  )
}

function ReaderError({ message, onRetry }: ReaderErrorProps) {
  return (
    <Alert className="mx-auto max-w-md" variant="destructive">
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription>
        <p>문서를 다시 불러와 보세요.</p>
        <Button className="mt-3" onClick={onRetry} variant="outline">
          PDF 다시 불러오기
        </Button>
      </AlertDescription>
    </Alert>
  )
}

export function Reader({ url, title }: ReaderProps) {
  const documentState = usePdfDocument(url)
  const { availableHeight, availableWidth, containerRef, isWideScreen } = useReaderLayout()
  const [panelOpen, setPanelOpen] = useState(false)
  const panelButtonRef = useRef<HTMLButtonElement>(null)
  const firstPage = documentState.pages[0]
  const isPageReady =
    documentState.status === 'ready' &&
    firstPage !== undefined &&
    availableWidth > 0 &&
    availableHeight > 0
  const scale = isPageReady
    ? calculateSinglePageFitScale(
        firstPage.width,
        firstPage.height,
        availableWidth,
        availableHeight,
      )
    : null

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <ReaderToolbar
        onTogglePanel={() => setPanelOpen((open) => !open)}
        panelButtonRef={panelButtonRef}
        panelOpen={panelOpen}
        title={getReaderTitle(url, title)}
      />

      <div className="flex min-h-0 flex-1">
        <main
          aria-label="PDF 읽기 영역"
          className="min-h-0 min-w-0 flex-1 p-reader-page-mobile"
          ref={containerRef}
        >
          {documentState.status === 'loading' && <ReaderLoading label="PDF 불러오는 중" />}

          {documentState.status === 'error' && (
            <ReaderError message={documentState.error.message} onRetry={documentState.retry} />
          )}

          {documentState.status === 'ready' && firstPage === undefined && (
            <ReaderError message="표시할 PDF 페이지가 없습니다." onRetry={documentState.retry} />
          )}

          {documentState.status === 'ready' &&
            firstPage !== undefined &&
            (availableWidth === 0 || availableHeight === 0) && (
              <ReaderLoading label="읽기 영역 계산 중" />
            )}

          {isPageReady && scale !== null && (
            <PdfViewport document={documentState.document} page={firstPage} scale={scale} />
          )}
        </main>

        <ReaderPanel
          isWideScreen={isWideScreen}
          onOpenChange={setPanelOpen}
          open={panelOpen}
          openButtonRef={panelButtonRef}
        />
      </div>

      <footer className="flex min-h-12 shrink-0 items-center justify-center border-t px-4 py-2">
        {isPageReady && <output aria-label="페이지 위치">1 / {documentState.pages.length}</output>}
      </footer>
    </div>
  )
}
