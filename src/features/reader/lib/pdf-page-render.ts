import { PDF_CSS_SCALE, type PdfPageHandle, type PdfPageViewport } from './pdf-document'

interface PdfRenderParameters {
  canvas: HTMLCanvasElement
  viewport: PdfPageViewport
  transform?: number[]
}

interface PdfRenderTask {
  readonly promise: Promise<void>
  cancel(): void
}

export interface RenderablePdfPage extends PdfPageHandle {
  render(parameters: PdfRenderParameters): PdfRenderTask
}

export function isRenderablePdfPage(page: PdfPageHandle): page is RenderablePdfPage {
  return 'render' in page && typeof page.render === 'function'
}

function getDevicePixelRatio() {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
}

/** CSS 표시 크기는 유지하고 DPR만 Canvas 픽셀과 렌더링 좌표에 반영해 PDF 페이지를 그린다. */
export async function renderPdfPageToCanvas(
  page: RenderablePdfPage,
  canvas: HTMLCanvasElement,
  scale: number,
  signal: AbortSignal,
) {
  const viewport = page.getViewport({ scale: PDF_CSS_SCALE * scale })
  const pixelRatio = getDevicePixelRatio()
  canvas.width = Math.floor(viewport.width * pixelRatio)
  canvas.height = Math.floor(viewport.height * pixelRatio)
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const renderTask = page.render({
    canvas,
    viewport,
    transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
  })
  const cancelRender = () => {
    renderTask.cancel()
  }
  signal.addEventListener('abort', cancelRender, { once: true })
  try {
    await renderTask.promise
  } finally {
    signal.removeEventListener('abort', cancelRender)
  }
  signal.throwIfAborted()
}
