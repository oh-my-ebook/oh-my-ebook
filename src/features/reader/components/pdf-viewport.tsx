import { useEffect, useRef, useState } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PDF_CSS_SCALE,
  type PdfDocumentHandle,
  type PdfPageHandle,
  type PdfPageInfo,
  type PdfPageViewport,
} from '../lib/pdf-document'

interface PdfViewportBaseProps {
  document: PdfDocumentHandle
  scale: number
  onStatusChange?: (status: PdfViewportStatus) => void
}

interface PdfViewportSinglePageProps extends PdfViewportBaseProps {
  page: PdfPageInfo
}

interface PdfViewportPagesProps extends PdfViewportBaseProps {
  pages: readonly PdfPageInfo[]
}

type PdfViewportProps = PdfViewportSinglePageProps | PdfViewportPagesProps

export type PdfViewportStatus = 'error' | 'loading' | 'ready'

interface PdfRenderParameters {
  canvas: HTMLCanvasElement
  viewport: PdfPageViewport
  transform?: number[]
}

interface PdfRenderTask {
  readonly promise: Promise<void>
  cancel(): void
}

interface RenderablePdfPage extends PdfPageHandle {
  render(parameters: PdfRenderParameters): PdfRenderTask
}

interface PdfViewportRequest {
  attempt: number
  document: PdfDocumentHandle
  pageNumbers: string
  scale: number
}

interface PdfViewportOutcome {
  request: PdfViewportRequest
  status: 'error' | 'ready'
}

function isRenderablePdfPage(page: PdfPageHandle): page is RenderablePdfPage {
  return 'render' in page && typeof page.render === 'function'
}

function isCurrentOutcome(
  outcome: PdfViewportOutcome | null,
  request: PdfViewportRequest,
): outcome is PdfViewportOutcome {
  return (
    outcome !== null &&
    outcome.request.attempt === request.attempt &&
    outcome.request.document === request.document &&
    outcome.request.pageNumbers === request.pageNumbers &&
    outcome.request.scale === request.scale
  )
}

function getDevicePixelRatio() {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
}

export function PdfViewport(props: PdfViewportSinglePageProps): React.JSX.Element
export function PdfViewport(props: PdfViewportPagesProps): React.JSX.Element
export function PdfViewport(props: PdfViewportProps) {
  const { document, onStatusChange, scale } = props
  const requestedPages = 'pages' in props ? props.pages : [props.page]
  const pages = requestedPages.slice(0, 2)
  const firstPageNumber = pages[0]?.pageNumber
  const secondPageNumber = pages[1]?.pageNumber
  const pageNumbers = pages.map(({ pageNumber }) => pageNumber).join(',')
  const pageRange = pages.map(({ pageNumber }) => pageNumber).join('–')
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<PdfViewportOutcome | null>(null)
  const request = { attempt, document, pageNumbers, scale }
  const status = isCurrentOutcome(outcome, request) ? outcome.status : 'loading'

  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current
    const requestedPageNumbers = [firstPageNumber, secondPageNumber].filter(
      (pageNumber): pageNumber is number => pageNumber !== undefined,
    )
    if (!canvasContainer || requestedPageNumbers.length === 0) {
      return
    }

    const controller = new AbortController()
    const canvases = requestedPageNumbers.map((pageNumber) => {
      const canvas = canvasContainer.ownerDocument.createElement('canvas')
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', `PDF ${pageNumber}페이지`)
      canvas.textContent = `PDF ${pageNumber}페이지`
      return canvas
    })
    canvasContainer.replaceChildren(...canvases)

    const renderPage = async (pageNumber: number, canvas: HTMLCanvasElement) => {
      const pdfPage = await document.getPage(pageNumber)
      controller.signal.throwIfAborted()
      if (!isRenderablePdfPage(pdfPage)) {
        throw new Error('PDF 페이지를 그릴 수 없습니다.')
      }

      const viewport = pdfPage.getViewport({ scale: PDF_CSS_SCALE * scale })
      const pixelRatio = getDevicePixelRatio()
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      // CSS 표시 크기는 유지하고 DPR만 Canvas 픽셀과 렌더링 좌표에 반영한다.
      const renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      })
      const cancelRender = () => {
        renderTask.cancel()
      }
      controller.signal.addEventListener('abort', cancelRender, { once: true })
      try {
        await renderTask.promise
      } finally {
        controller.signal.removeEventListener('abort', cancelRender)
      }
      controller.signal.throwIfAborted()
    }

    const renderPages = async () => {
      try {
        await Promise.all(
          requestedPageNumbers.map((pageNumber, index) => renderPage(pageNumber, canvases[index])),
        )
        setOutcome({
          request: { attempt, document, pageNumbers, scale },
          status: 'ready',
        })
      } catch {
        if (controller.signal.aborted) {
          return
        }
        controller.abort()
        canvases.forEach((canvas) => canvas.remove())
        setOutcome({
          request: { attempt, document, pageNumbers, scale },
          status: 'error',
        })
      }
    }

    void renderPages()

    return () => {
      controller.abort()
      canvases.forEach((canvas) => canvas.remove())
    }
  }, [attempt, document, firstPageNumber, pageNumbers, scale, secondPageNumber])

  return (
    <section
      aria-busy={status === 'loading'}
      aria-label="PDF 본문"
      className="flex h-full min-h-0 items-start justify-center overflow-hidden"
    >
      <div
        className="flex w-fit gap-reader-spread-gap"
        hidden={status !== 'ready'}
        ref={canvasContainerRef}
      />

      {status === 'loading' && (
        <div
          aria-label={`PDF ${pageRange}페이지 표시 중`}
          className="flex w-fit gap-reader-spread-gap"
          role="status"
        >
          {pages.map((page) => (
            <Skeleton
              className="shrink-0"
              key={page.pageNumber}
              style={{ height: page.height * scale, width: page.width * scale }}
            />
          ))}
        </div>
      )}

      {status === 'error' && (
        <Alert className="mx-auto max-w-md" variant="destructive">
          <AlertTitle>{pageRange}페이지를 표시하지 못했습니다.</AlertTitle>
          <AlertDescription>페이지를 다시 그려 보세요.</AlertDescription>
          <AlertAction>
            <Button onClick={() => setAttempt((current) => current + 1)} variant="outline">
              다시 시도
            </Button>
          </AlertAction>
        </Alert>
      )}
    </section>
  )
}
