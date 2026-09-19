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
import { recognizePdfPage, type OcrPageResult } from '../lib/ocr/page-recognition'

interface PdfViewportBaseProps {
  document: PdfDocumentHandle
  scale: number
  onOcrTextChange?: (textByPage: ReadonlyMap<number, string>) => void
  onStatusChange?: (status: PdfViewportStatus) => void
}

interface PdfViewportSinglePageProps extends PdfViewportBaseProps {
  page: PdfPageInfo
  pages?: never
}

interface PdfViewportPagesProps extends PdfViewportBaseProps {
  page?: never
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

interface OcrOutcome {
  document: PdfDocumentHandle
  pageNumbers: string
  pages: ReadonlyMap<number, OcrPageResult>
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
  const { document, onOcrTextChange, onStatusChange, scale } = props
  const requestedPages = props.pages ?? (props.page ? [props.page] : [])
  const pages = requestedPages.slice(0, 2)
  const firstPageNumber = pages[0]?.pageNumber
  const secondPageNumber = pages[1]?.pageNumber
  const pageNumbers = pages.map(({ pageNumber }) => pageNumber).join(',')
  const pageRange = pages.map(({ pageNumber }) => pageNumber).join('–')
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<PdfViewportOutcome | null>(null)
  const [ocrOutcome, setOcrOutcome] = useState<OcrOutcome | null>(null)
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
      canvas.style.width = '100%'
      canvas.style.height = '100%'

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

    const canvasContainers = canvasContainer.querySelectorAll('[data-slot="pdf-page-canvas"]')
    canvasContainers.forEach((container, index) => container.replaceChildren(canvases[index]))
    void renderPages()

    return () => {
      controller.abort()
      canvases.forEach((canvas) => canvas.remove())
    }
  }, [attempt, document, firstPageNumber, pageNumbers, scale, secondPageNumber])

  useEffect(() => {
    const requestedPageNumbers = [firstPageNumber, secondPageNumber].filter(
      (pageNumber): pageNumber is number => pageNumber !== undefined,
    )
    if (requestedPageNumbers.length === 0) {
      return
    }

    const controller = new AbortController()
    const recognizePages = async () => {
      const recognizedPages: (readonly [number, OcrPageResult] | null)[] = await Promise.all(
        requestedPageNumbers.map(async (pageNumber) => {
          try {
            const page = await document.getPage(pageNumber)
            const result = await recognizePdfPage(page, controller.signal)
            return [pageNumber, result] as const
          } catch {
            return null
          }
        }),
      )
      if (!controller.signal.aborted) {
        const successfulOcrResults: (readonly [number, OcrPageResult])[] = recognizedPages.filter(
          (recognizedPage) => recognizedPage !== null,
        )
        // key는 PDF 페이지 번호, value는 좌표와 텍스트 줄을 포함한 OCR 결과다.
        const ocrResultsByPageNumber = new Map(successfulOcrResults)
        const pageTextEntries: (readonly [number, string])[] = requestedPageNumbers.map(
          (pageNumber) => {
            const ocrResult = ocrResultsByPageNumber.get(pageNumber)
            const recognizedLines = ocrResult?.lines ?? []
            const pageText = recognizedLines.map((line) => line.text).join('\n')

            return [pageNumber, pageText] as const
          },
        )
        // key는 PDF 페이지 번호, value는 해당 페이지의 OCR 줄을 합친 본문이다.
        const ocrTextByPageNumber = new Map(pageTextEntries)

        setOcrOutcome({
          document,
          pageNumbers,
          pages: ocrResultsByPageNumber,
        })
        onOcrTextChange?.(ocrTextByPageNumber)
      }
    }

    void recognizePages()
    return () => controller.abort()
  }, [document, firstPageNumber, onOcrTextChange, pageNumbers, secondPageNumber])

  const ocrPages =
    ocrOutcome?.document === document && ocrOutcome.pageNumbers === pageNumbers
      ? ocrOutcome.pages
      : new Map<number, OcrPageResult>()

  return (
    <section aria-busy={status === 'loading'} aria-label="PDF 본문" className="h-full min-h-0">
      <div
        aria-label={status === 'loading' ? `PDF ${pageRange}페이지 표시 중` : undefined}
        className="flex min-h-full w-max min-w-full items-center justify-center gap-reader-spread-gap"
        hidden={status === 'error'}
        ref={canvasContainerRef}
        role={status === 'loading' ? 'status' : undefined}
      >
        {pages.map((page) => {
          const ocrPage = ocrPages.get(page.pageNumber)
          return (
            <div
              className="relative shrink-0 overflow-hidden transition-[width,height] duration-200 ease-out motion-reduce:transition-none [container-type:inline-size]"
              data-slot="pdf-page-frame"
              key={page.pageNumber}
              style={{ height: page.height * scale, width: page.width * scale }}
            >
              <div
                className="h-full w-full"
                data-slot="pdf-page-canvas"
                hidden={status !== 'ready'}
              />
              {status === 'ready' && ocrPage && (
                <div
                  aria-label={`PDF ${page.pageNumber}페이지 OCR 텍스트 레이어`}
                  className="absolute inset-0 overflow-hidden"
                >
                  {ocrPage.lines.map((line, index) => (
                    <span
                      className="absolute origin-top-left cursor-text select-text whitespace-pre bg-ocr-highlight/20 text-transparent outline-1 outline-ocr-highlight/40 selection:bg-ocr-highlight/80"
                      key={`${line.x0}-${line.y0}-${index}`}
                      style={{
                        left: `${(line.x0 / ocrPage.width) * 100}%`,
                        top: `${(line.y0 / ocrPage.height) * 100}%`,
                        fontSize: `${(line.fontSize / ocrPage.width) * 100}cqw`,
                        lineHeight: 1,
                        transform: `scaleX(${line.scaleX})`,
                      }}
                    >
                      {line.text}
                    </span>
                  ))}
                </div>
              )}
              {status === 'loading' && <Skeleton className="absolute inset-0 h-full w-full" />}
            </div>
          )
        })}
      </div>

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
