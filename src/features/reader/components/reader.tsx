import { useCallback, useEffect, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import type { BookAnalysisStatus, SearchChunkSource } from '@/features/ebook-list/ebook-types'
import { Button } from '@/components/ui/button'
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorAlert } from '@/components/error-alert'
import { usePdfDocument } from '../hooks/use-pdf-document'
import { useReaderLayout } from '../hooks/use-reader-layout'
import { calculatePageSpread, type PageViewMode } from '../lib/page-spread'
import type { BookMetadata } from '../lib/book-metadata'
import type { SearchChunks } from '../lib/rag/search-book-chunks'
import type { PdfDocumentSource } from '../lib/pdf-document'
import type { StoredOcrPageResult } from '../lib/ocr/page-recognition'
import { focusTocPageThumbnail } from '../lib/toc-focus'
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
import { PdfViewport, type OcrText } from './pdf-viewport'
import { ReaderChat, type ReaderQuoteRequest } from './reader-chat'
import { ReaderPanel } from './reader-panel'
import { ReaderToc } from './reader-toc'
import { ReaderToolbar } from './reader-toolbar'
import { ZoomControls } from './zoom-controls'

interface ReaderProps {
  analysisStatus?: BookAnalysisStatus
  bookId?: string
  bookMetadata?: BookMetadata
  chatModel?: ChatModelAdapter
  url?: string
  data?: Uint8Array
  title?: string
  initialPage?: number
  getStoredOcrPage?(pageNumber: number): Promise<StoredOcrPageResult | null>
  onPageChange?(pageNumber: number): void
  searchChunks?: SearchChunks
}

interface ReaderErrorProps {
  message: string
  onRetry: () => void
}

interface ReaderLoadingProps {
  label: string
}

interface EvidenceNavigation {
  returnPage: number
  source: SearchChunkSource
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
    <ErrorAlert
      className="mx-auto max-w-md"
      description="문서를 다시 불러와 보세요."
      title={message}
    >
      <Button onClick={onRetry}>PDF 다시 불러오기</Button>
    </ErrorAlert>
  )
}

// 화살표를 직접 쓰는 조작부(글자 입력, 슬라이더, 패널 구분선, 보기 방식)나 열린 Sheet 안에서는
// 화살표를 페이지 이동에 쓰지 않는다. 다만 목차 Sheet는 위아래 화살표로 직접 페이지를 넘길 수 있어야
// 하므로 이 제외 대상에서 뺀다.
const TOC_CONTAINER_SELECTOR = '[aria-label="목차"]'
const ARROW_KEY_OWNER_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="slider"]',
  '[role="separator"]',
  `[role="dialog"]:not(${TOC_CONTAINER_SELECTOR})`,
  '[data-slot="toggle-group"]',
].join(', ')

// 포커스가 목차 패널 안에 있을 때만 좌우 화살표 대신 위아래 화살표로 페이지를 넘긴다.
// 목차가 열려 있어도 포커스가 밖에 있으면(예: 넓은 화면에서 여는 버튼에 남은 포커스) 좌우 화살표는 그대로 쓴다.
function getArrowKeyTargetPage(
  key: string,
  isFocusInToc: boolean,
  previousPage: number | null,
  nextPage: number | null,
) {
  if (isFocusInToc) {
    if (key === 'ArrowUp') return previousPage
    if (key === 'ArrowDown') return nextPage
    return undefined
  }
  if (key === 'ArrowLeft') return previousPage
  if (key === 'ArrowRight') return nextPage
  return undefined
}

export function Reader({
  analysisStatus,
  bookMetadata,
  bookId,
  chatModel,
  data,
  getStoredOcrPage,
  initialPage,
  onPageChange,
  searchChunks,
  title,
  url,
}: ReaderProps) {
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
  const [quoteRequest, setQuoteRequest] = useState<ReaderQuoteRequest | null>(null)
  const [evidenceNavigation, setEvidenceNavigation] = useState<EvidenceNavigation | null>(null)
  const quoteRequestIdRef = useRef(0)

  const handleTextSelectionAction = useCallback(
    (
      action: ReaderQuoteRequest['action'],
      selection: Omit<ReaderQuoteRequest, 'action' | 'id'>,
    ) => {
      quoteRequestIdRef.current += 1
      setQuoteRequest({ action, id: quoteRequestIdRef.current, ...selection })
      setPanelOpen(true)
    },
    [],
  )

  const handleQuoteRequestHandled = useCallback((requestId: number) => {
    setQuoteRequest((currentRequest) => (currentRequest?.id === requestId ? null : currentRequest))
  }, [])

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
  const goToPage = (pageNumber: number) => {
    setCurrentPage(pageNumber)
    onPageChange?.(pageNumber)
    // 스크롤은 읽기 영역을 감싼 ResizablePanel의 내부 요소가 맡는다.
    containerRef.current?.parentElement?.scrollTo({ top: 0 })
  }

  const handlePageChange = (pageNumber: number) => {
    setEvidenceNavigation(null)
    goToPage(pageNumber)
  }

  const handleEvidenceNavigate = (source: SearchChunkSource) => {
    if (
      documentState.status !== 'ready' ||
      source.pageNumber < 1 ||
      source.pageNumber > documentState.pages.length
    ) {
      return
    }
    setEvidenceNavigation((current) => ({
      returnPage: current?.returnPage ?? currentPage,
      source,
    }))
    goToPage(source.pageNumber)
  }

  const handleEvidenceReturn = () => {
    if (!evidenceNavigation) return
    const { returnPage } = evidenceNavigation
    setEvidenceNavigation(null)
    goToPage(returnPage)
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

      const tocContainer =
        event.target instanceof Element ? event.target.closest(TOC_CONTAINER_SELECTOR) : null
      const targetPage = getArrowKeyTargetPage(
        event.key,
        tocContainer !== null,
        previousPage,
        nextPage,
      )
      if (targetPage === undefined) {
        return
      }

      event.preventDefault()
      if (targetPage !== null) {
        handlePageChange(targetPage)
        // 목차 안에서 화살표로 옮겼다면, 이어서 Enter를 눌러도 이전에 포커스가 남아 있던
        // 페이지로 되돌아가지 않도록 새로 선택된 페이지의 썸네일로 포커스도 옮긴다.
        if (tocContainer) {
          focusTocPageThumbnail(tocContainer, targetPage)
        }
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
          evidenceSource={evidenceNavigation?.source}
          getStoredOcrPage={getStoredOcrPage}
          onOcrTextChange={setOcrText}
          onTextSelectionAction={handleTextSelectionAction}
          pages={pageSpread.pages}
          scale={displayScale}
        />
      )}
    </main>
  )

  const currentPageText =
    ocrText?.document === documentState.document ? ocrText.textByPage.get(currentPage) : undefined

  const readerPanel = (
    <ReaderPanel
      isWideScreen={isWideScreen}
      onOpenChange={setPanelOpen}
      open={panelOpen}
      openButtonRef={panelButtonRef}
    >
      <ReaderChat
        analysisStatus={analysisStatus}
        bookMetadata={bookMetadata}
        bookId={bookId}
        chatModel={chatModel}
        currentPage={currentPage}
        currentPageText={currentPageText}
        key={url}
        onEvidenceNavigate={handleEvidenceNavigate}
        onQuoteRequestHandled={handleQuoteRequestHandled}
        quoteRequest={quoteRequest}
        searchChunks={searchChunks}
      />
    </ReaderPanel>
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
          currentPage={currentPage}
          document={documentState.document}
          isWideScreen={isWideScreen}
          nextPage={nextPage}
          onOpenChange={setTocOpen}
          onPageChange={handlePageChange}
          open={tocOpen}
          openButtonRef={tocButtonRef}
          pages={documentState.pages}
          previousPage={previousPage}
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
            {evidenceNavigation && (
              <Button onClick={handleEvidenceReturn} size="sm" type="button" variant="secondary">
                <Undo2 data-icon="inline-start" />
                이전 위치로 돌아가기
              </Button>
            )}
            <div className="min-w-64 flex-1">
              <PageNavigator
                currentPage={currentPage}
                nextPage={nextPage}
                onPageChange={handlePageChange}
                previousPage={previousPage}
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
