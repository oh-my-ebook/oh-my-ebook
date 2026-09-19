import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { usePdfDocument } from '../hooks/use-pdf-document'
import { useReaderLayout } from '../hooks/use-reader-layout'
import { calculatePageSpread, type PageViewMode } from '../lib/page-spread'
import type { BookMetadata } from '../lib/book-metadata'
import type { PdfDocumentHandle, PdfDocumentSource } from '../lib/pdf-document'
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
import { ReaderToc } from './reader-toc'
import { ReaderToolbar } from './reader-toolbar'
import { ZoomControls } from './zoom-controls'

interface ReaderProps {
  bookMetadata?: BookMetadata
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

interface OcrText {
  document: PdfDocumentHandle
  textByPage: ReadonlyMap<number, string>
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

// 화살표를 직접 쓰는 조작부(글자 입력, 슬라이더, 패널 구분선, 보기 방식)나 열린 Sheet 안에서는
// 화살표를 페이지 이동에 쓰지 않는다.
const ARROW_KEY_OWNER_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[role="separator"]',
  '[role="dialog"]',
  '[data-slot="toggle-group"]',
].join(', ')

export function Reader({ bookMetadata, data, initialPage, onPageChange, title, url }: ReaderProps) {
  const source = data ?? url ?? ''
  const [currentPage, setCurrentPage] = useState(1)
  const [preferredView, setPreferredView] = useState<PageViewMode>('single')
  const documentState = usePdfDocument(source)
  const { availableHeight, availableWidth, containerRef, isWideScreen, isSpreadAvailable } =
    useReaderLayout()
  const [zoom, setZoom] = useState<ReaderZoom>(FIT_HEIGHT_ZOOM)
  const [panelOpen, setPanelOpen] = useState(false)
  const panelButtonRef = useRef<HTMLButtonElement>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const tocButtonRef = useRef<HTMLButtonElement>(null)
  const [ocrText, setOcrText] = useState<OcrText | null>(null)

  useEffect(() => {
    if (documentState.status !== 'ready') return
    // 새 문서와 저장된 초기 위치는 페이지 수를 확인한 뒤 적용한다.
    // oxlint-disable-next-line react/set-state-in-effect
    setCurrentPage(getInitialPage(initialPage, documentState.pages.length))
  }, [documentState.pages, documentState.status, initialPage, source])

  const handleOcrTextChange = useCallback(
    (textByPage: ReadonlyMap<number, string>) => {
      if (documentState.status === 'ready') {
        setOcrText({ document: documentState.document, textByPage })
      }
    },
    [documentState.document, documentState.status],
  )

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
    // 스크롤은 읽기 영역을 감싼 ResizablePanel의 내부 요소가 맡는다.
    containerRef.current?.parentElement?.scrollTo({ top: 0 })
  }

  const previousPage = isPageReady ? pageSpread.previousPage : null
  const nextPage = isPageReady ? pageSpread.nextPage : null

  // 키를 누르고 있을 때 오는 반복 keydown도 막지 않아야 계속 넘어간다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }
      if (event.target instanceof Element && event.target.closest(ARROW_KEY_OWNER_SELECTOR)) {
        return
      }

      const targetPage =
        event.key === 'ArrowLeft' ? previousPage : event.key === 'ArrowRight' ? nextPage : undefined
      if (targetPage === undefined) {
        return
      }

      event.preventDefault()
      if (targetPage !== null) {
        handlePageChange(targetPage)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  const readerMain = (
    <main
      aria-label="PDF 읽기 영역"
      className="m-3 h-[calc(100%-1.5rem)] min-h-0 min-w-0 flex-1"
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
          onOcrTextChange={handleOcrTextChange}
          pages={pageSpread.pages}
          scale={displayScale}
        />
      )}
    </main>
  )

  const ocrTextForCurrentDocument =
    documentState.status === 'ready' && ocrText?.document === documentState.document
      ? ocrText
      : null
  const currentPageText = ocrTextForCurrentDocument?.textByPage.get(currentPage) ?? null

  const readerPanel = (
    <ReaderPanel
      bookMetadata={bookMetadata}
      chatSessionKey={url}
      currentPage={currentPage}
      currentPageText={currentPageText}
      isWideScreen={isWideScreen}
      onOpenChange={setPanelOpen}
      open={panelOpen}
      openButtonRef={panelButtonRef}
    />
  )

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <ReaderToolbar
        isSpreadAvailable={isSpreadAvailable}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onToggleToc={() => setTocOpen((open) => !open)}
        onViewChange={setPreferredView}
        panelButtonRef={panelButtonRef}
        panelOpen={panelOpen}
        preferredView={preferredView}
        title={getReaderTitle(source, title)}
        tocButtonRef={tocButtonRef}
        tocOpen={tocOpen}
      />

      <div className="flex min-h-0 flex-1">
        <ReaderToc
          isWideScreen={isWideScreen}
          onOpenChange={setTocOpen}
          open={tocOpen}
          openButtonRef={tocButtonRef}
        />
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize="70%" id="reader" minSize="45%">
            {readerMain}
          </ResizablePanel>
          {isWideScreen && readerPanel}
        </ResizablePanelGroup>
        {!isWideScreen && readerPanel}
      </div>

      <footer className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-t bg-card px-4 py-2">
        {isPageReady && (
          <>
            <div className="min-w-64 flex-1">
              <PageNavigator
                currentPage={currentPage}
                onPageChange={handlePageChange}
                totalPages={documentState.pages.length}
              />
            </div>
            <Separator
              className="h-5 data-vertical:w-[1.5px] data-vertical:self-center"
              orientation="vertical"
            />
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
          </>
        )}
      </footer>
    </div>
  )
}
