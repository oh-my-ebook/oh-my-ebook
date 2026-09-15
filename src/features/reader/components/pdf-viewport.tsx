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

interface PdfViewportProps {
  document: PdfDocumentHandle
  page: PdfPageInfo
  scale: number
}

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
  pageNumber: number
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
    outcome.request.pageNumber === request.pageNumber &&
    outcome.request.scale === request.scale
  )
}

function getDevicePixelRatio() {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
}

export function PdfViewport({ document, page, scale }: PdfViewportProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<PdfViewportOutcome | null>(null)
  const request = { attempt, document, pageNumber: page.pageNumber, scale }
  const status = isCurrentOutcome(outcome, request) ? outcome.status : 'loading'

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current
    if (!canvasContainer) {
      return
    }

    let active = true
    let canvas: HTMLCanvasElement | undefined
    let renderTask: PdfRenderTask | undefined
    let renderPending = false
    canvasContainer.replaceChildren()

    const renderPage = async () => {
      try {
        const pdfPage = await document.getPage(page.pageNumber)
        if (!active) {
          return
        }
        if (!isRenderablePdfPage(pdfPage)) {
          throw new Error('PDF 페이지를 그릴 수 없습니다.')
        }

        const viewport = pdfPage.getViewport({ scale: PDF_CSS_SCALE * scale })
        const pixelRatio = getDevicePixelRatio()
        canvas = canvasContainer.ownerDocument.createElement('canvas')
        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `PDF ${page.pageNumber}페이지`)
        canvas.textContent = `PDF ${page.pageNumber}페이지`
        canvasContainer.replaceChildren(canvas)

        // CSS 표시 크기는 유지하고 DPR만 Canvas 픽셀과 렌더링 좌표에 반영한다.
        renderTask = pdfPage.render({
          canvas,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        })
        renderPending = true
        await renderTask.promise
        renderPending = false
        if (!active) {
          return
        }
        setOutcome({
          request: { attempt, document, pageNumber: page.pageNumber, scale },
          status: 'ready',
        })
      } catch {
        renderPending = false
        if (!active) {
          return
        }
        canvas?.remove()
        setOutcome({
          request: { attempt, document, pageNumber: page.pageNumber, scale },
          status: 'error',
        })
      }
    }

    renderPage()

    return () => {
      active = false
      if (renderPending) {
        renderTask?.cancel()
      }
      canvas?.remove()
    }
  }, [attempt, document, page.pageNumber, scale])

  const displayWidth = page.width * scale
  const displayHeight = page.height * scale

  return (
    <section
      aria-busy={status === 'loading'}
      aria-label="PDF 본문"
      className="min-h-0 overflow-auto p-reader-page-mobile"
    >
      <div className="mx-auto w-fit" hidden={status !== 'ready'} ref={canvasContainerRef} />

      {status === 'loading' && (
        <div
          aria-label={`PDF ${page.pageNumber}페이지 표시 중`}
          className="mx-auto"
          role="status"
          style={{ height: displayHeight, width: displayWidth }}
        >
          <Skeleton className="h-full w-full" />
        </div>
      )}

      {status === 'error' && (
        <Alert className="mx-auto max-w-md" variant="destructive">
          <AlertTitle>{page.pageNumber}페이지를 표시하지 못했습니다.</AlertTitle>
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
