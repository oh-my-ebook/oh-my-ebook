import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorAlert } from '@/components/error-alert'
import {
  PDF_CSS_SCALE,
  type PdfDocumentHandle,
  type PdfPageHandle,
  type PdfPageInfo,
  type PdfPageViewport,
} from '../lib/pdf-document'
import {
  postprocessStoredOcrPage,
  recognizePdfPage,
  type OcrPageResult,
  type StoredOcrPageResult,
} from '../lib/ocr/page-recognition'

// 어떤 문서의 결과인지 함께 넘겨, 받는 쪽이 문서가 바뀐 뒤 남은 이전 결과를 걸러낼 수 있게 한다.
export interface OcrText {
  document: PdfDocumentHandle
  textByPage: ReadonlyMap<number, string>
}

interface PdfViewportBaseProps {
  document: PdfDocumentHandle
  getStoredOcrPage?(pageNumber: number): Promise<StoredOcrPageResult | null>
  scale: number
  onOcrTextChange?: (ocrText: OcrText) => void
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

function isSameRenderTarget(a: PdfViewportRequest, b: PdfViewportRequest) {
  return a.document === b.document && a.pageNumbers === b.pageNumbers
}

function isCurrentOutcome(
  outcome: PdfViewportOutcome | null,
  request: PdfViewportRequest,
): outcome is PdfViewportOutcome {
  return (
    outcome !== null &&
    outcome.request.attempt === request.attempt &&
    outcome.request.scale === request.scale &&
    isSameRenderTarget(outcome.request, request)
  )
}

// 배율만 바뀌어 다시 그리는 동안에는, 같은 문서·페이지를 이미 성공적으로 그려둔 이전 결과를
// 스켈레톤 대신 그대로 보여준다. 배율이 프레임마다 미세하게 바뀌는 리사이즈 중에도
// 캔버스가 깜빡이지 않도록 하기 위함이다.
function isRevalidatableOutcome(
  outcome: PdfViewportOutcome | null,
  request: PdfViewportRequest,
): outcome is PdfViewportOutcome {
  return (
    outcome !== null && outcome.status === 'ready' && isSameRenderTarget(outcome.request, request)
  )
}

function getPdfViewportStatus(
  outcome: PdfViewportOutcome | null,
  request: PdfViewportRequest,
): PdfViewportStatus {
  if (isCurrentOutcome(outcome, request)) {
    return outcome.status
  }
  if (isRevalidatableOutcome(outcome, request)) {
    return 'ready'
  }
  return 'loading'
}

function getDevicePixelRatio() {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
}

export function PdfViewport(props: PdfViewportSinglePageProps): React.JSX.Element
export function PdfViewport(props: PdfViewportPagesProps): React.JSX.Element
export function PdfViewport(props: PdfViewportProps) {
  const { document, getStoredOcrPage, onOcrTextChange, onStatusChange, scale } = props
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
  const status = getPdfViewportStatus(outcome, request)

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

    // 페이지 순서대로 캔버스 슬롯을 비우거나(재검증 실패) 새 캔버스로 교체한다(렌더링 성공).
    const replaceCanvasSlots = (nextCanvases: readonly HTMLCanvasElement[]) => {
      const canvasSlots = canvasContainer.querySelectorAll('[data-slot="pdf-page-canvas"]')
      canvasSlots.forEach((slot, index) =>
        slot.replaceChildren(...(nextCanvases[index] ? [nextCanvases[index]] : [])),
      )
    }

    const renderPages = async () => {
      try {
        await Promise.all(
          requestedPageNumbers.map((pageNumber, index) => renderPage(pageNumber, canvases[index])),
        )
        if (controller.signal.aborted) {
          return
        }
        // 이전 결과가 화면에 남아 있다면 새 캔버스가 준비된 뒤에만 교체해 깜빡임을 막는다.
        replaceCanvasSlots(canvases)
        setOutcome({
          request: { attempt, document, pageNumbers, scale },
          status: 'ready',
        })
      } catch {
        if (controller.signal.aborted) {
          return
        }
        controller.abort()
        // 재검증 중 실패하면 숨겨질 이전 결과의 캔버스도 함께 비워 오래 남지 않게 한다.
        replaceCanvasSlots([])
        setOutcome({
          request: { attempt, document, pageNumbers, scale },
          status: 'error',
        })
      }
    }

    void renderPages()

    return () => {
      controller.abort()
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
      const recognizedPages = await Promise.all(
        requestedPageNumbers.map(async (pageNumber) => {
          try {
            let storedOcrPage: StoredOcrPageResult | null = null
            try {
              storedOcrPage = (await getStoredOcrPage?.(pageNumber)) ?? null
            } catch {
              // 저장소 조회에 실패해도 기존 즉석 OCR 경로를 유지한다.
            }
            const result = storedOcrPage
              ? await postprocessStoredOcrPage(storedOcrPage, controller.signal)
              : await recognizePdfPage(await document.getPage(pageNumber), controller.signal)
            return [pageNumber, result] as const
          } catch {
            return null
          }
        }),
      )
      if (controller.signal.aborted) return

      const resultsByPage = new Map(recognizedPages.filter((page) => page !== null))
      const textByPage = new Map(
        requestedPageNumbers.map((pageNumber) => {
          const lines = resultsByPage.get(pageNumber)?.lines ?? []
          return [pageNumber, lines.map((line) => line.text).join('\n')] as const
        }),
      )
      setOcrOutcome({ document, pageNumbers, pages: resultsByPage })
      onOcrTextChange?.({ document, textByPage })
    }

    void recognizePages()
    return () => controller.abort()
  }, [document, firstPageNumber, getStoredOcrPage, onOcrTextChange, pageNumbers, secondPageNumber])

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
        <ErrorAlert
          className="mx-auto max-w-md"
          description="페이지를 다시 그려 보세요."
          title={`${pageRange}페이지를 표시하지 못했습니다.`}
        >
          <Button onClick={() => setAttempt((current) => current + 1)}>다시 시도</Button>
        </ErrorAlert>
      )}
    </section>
  )
}
