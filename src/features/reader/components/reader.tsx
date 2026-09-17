import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePdfDocument } from '../hooks/use-pdf-document'
import { useReaderLayout } from '../hooks/use-reader-layout'
import { calculatePageSpread, type PageViewMode } from '../lib/page-spread'
import type { PdfDocumentSource } from '../lib/pdf-document'
import {
  FIT_HEIGHT_ZOOM,
  calculateFitHeightScale,
  canDecreaseZoom,
  canIncreaseZoom,
  decreaseZoom,
  getZoomScale,
  increaseZoom,
  type ReaderZoom,
} from '../lib/reader-zoom'
import { PageNavigator } from './page-navigator'
import { PdfViewport } from './pdf-viewport'
import { ReaderPanel } from './reader-panel'
import { ReaderToolbar } from './reader-toolbar'
import { ZoomControls } from './zoom-controls'

interface ReaderProps {
  url?: string
  data?: Uint8Array
  title?: string
  initialPage?: number
  onPageChange?(pageNumber: number): void
}

interface ReaderErrorProps {
  message: string
  onRetry: () => void
}

interface ReaderLoadingProps {
  label: string
}

const READER_SPREAD_GAP = 16

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

function getReaderTitle(source: PdfDocumentSource, title?: string) {
  const specifiedTitle = title?.trim()
  return specifiedTitle || (typeof source === 'string' ? getPdfFilename(source) : 'PDF 문서')
}

function getInitialPage(initialPage: number | undefined, totalPages: number) {
  if (
    initialPage === undefined ||
    !Number.isSafeInteger(initialPage) ||
    initialPage < 1 ||
    initialPage > totalPages
  ) {
    return 1
  }
  return initialPage
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

export function Reader({ data, initialPage, onPageChange, title, url }: ReaderProps) {
  const source = data ?? url ?? ''
  const [currentPage, setCurrentPage] = useState(1)
  const [preferredView, setPreferredView] = useState<PageViewMode>('single')
  const documentState = usePdfDocument(source)
  const { availableHeight, availableWidth, containerRef, isWideScreen, isSpreadAvailable } =
    useReaderLayout()
  const [zoom, setZoom] = useState<ReaderZoom>(FIT_HEIGHT_ZOOM)
  const [panelOpen, setPanelOpen] = useState(false)
  const panelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (documentState.status !== 'ready') return
    // 새 문서와 저장된 초기 위치는 페이지 수를 확인한 뒤 적용한다.
    // oxlint-disable-next-line react/set-state-in-effect
    setCurrentPage(getInitialPage(initialPage, documentState.pages.length))
  }, [documentState.pages, documentState.status, initialPage, source])

  const selectedPage = documentState.pages[currentPage - 1]
  const pageSpread = calculatePageSpread(
    documentState.pages,
    currentPage,
    preferredView,
    isSpreadAvailable,
  )
  const firstDisplayedPage = pageSpread.pages[0]
  const isPageReady =
    documentState.status === 'ready' &&
    firstDisplayedPage !== undefined &&
    availableWidth > 0 &&
    availableHeight > 0
  const fitHeightScale = isPageReady
    ? calculateFitHeightScale(
        [firstDisplayedPage, ...pageSpread.pages.slice(1)],
        { width: availableWidth, height: availableHeight },
        READER_SPREAD_GAP,
      )
    : null
  const displayScale = fitHeightScale === null ? 1 : getZoomScale(zoom, fitHeightScale)

  const handleZoomIn = () => {
    if (fitHeightScale === null) {
      return
    }
    setZoom((currentZoom) => increaseZoom(currentZoom, fitHeightScale))
  }

  const handleZoomOut = () => {
    if (fitHeightScale === null) {
      return
    }
    setZoom((currentZoom) => decreaseZoom(currentZoom, fitHeightScale))
  }
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber)
    onPageChange?.(pageNumber)
    containerRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <ReaderToolbar
        isSpreadAvailable={isSpreadAvailable}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onViewChange={setPreferredView}
        panelButtonRef={panelButtonRef}
        panelOpen={panelOpen}
        preferredView={preferredView}
        title={getReaderTitle(source, title)}
      >
        <ZoomControls
          isFitHeight={zoom.mode === 'fit-height'}
          scale={displayScale}
          canZoomIn={canIncreaseZoom(displayScale)}
          canZoomOut={canDecreaseZoom(displayScale)}
          disabled={!isPageReady}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitHeight={() => setZoom(FIT_HEIGHT_ZOOM)}
        />
      </ReaderToolbar>

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

          {documentState.status === 'ready' && selectedPage === undefined && (
            <ReaderError message="표시할 PDF 페이지가 없습니다." onRetry={documentState.retry} />
          )}

          {documentState.status === 'ready' &&
            selectedPage !== undefined &&
            (availableWidth === 0 || availableHeight === 0) && (
              <ReaderLoading label="읽기 영역 계산 중" />
            )}

          {isPageReady && fitHeightScale !== null && (
            <PdfViewport
              document={documentState.document}
              pages={pageSpread.pages}
              scale={displayScale}
            />
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
        {isPageReady && (
          <PageNavigator
            currentPage={currentPage}
            onPageChange={handlePageChange}
            totalPages={documentState.pages.length}
          />
        )}
      </footer>
    </div>
  )
}
