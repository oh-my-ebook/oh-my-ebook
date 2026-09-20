import { PDF_CSS_SCALE, type PdfPageHandle, type PdfPageViewport } from './pdf-document'
import type { BoundingBox } from './text-layer'

// 복사한 이미지가 화면 배율과 무관하게 선명하도록 2배로 그린다.
const IMAGE_COPY_SCALE = 2

interface PdfRenderParameters {
  canvas: HTMLCanvasElement
  viewport: PdfPageViewport
  transform?: number[]
  background?: string
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

/** 이미지 영역만 잘라 복사할 수 있는 PNG로 만든다. */
export async function renderPdfPageImage(page: PdfPageHandle, region: BoundingBox): Promise<Blob> {
  if (!isRenderablePdfPage(page)) {
    throw new Error('PDF 페이지를 그릴 수 없습니다.')
  }

  const viewport = page.getViewport({ scale: IMAGE_COPY_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((region.x1 - region.x0) * IMAGE_COPY_SCALE)
  canvas.height = Math.ceil((region.y1 - region.y0) * IMAGE_COPY_SCALE)

  try {
    // 영역의 왼쪽 위 모서리가 Canvas 원점에 오도록 페이지 전체를 옮겨 그린다.
    await page.render({
      canvas,
      viewport,
      transform: [1, 0, 0, 1, -region.x0 * IMAGE_COPY_SCALE, -region.y0 * IMAGE_COPY_SCALE],
      background: '#ffffff',
    }).promise
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!image) {
      throw new Error('이미지를 만들지 못했습니다.')
    }
    return image
  } finally {
    // 복사가 끝난 Canvas의 픽셀 메모리를 즉시 반환한다.
    canvas.width = 0
    canvas.height = 0
  }
}
