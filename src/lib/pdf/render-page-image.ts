import type { PdfPageHandle, PdfPageViewport } from '@/lib/pdf/document'
import type { PageImage } from '@/lib/reader-ocr/reader-ocr.types'

const OCR_SCALE = 160 / 72

interface OcrPdfPage extends PdfPageHandle {
  render(parameters: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: PdfPageViewport
    background: string
  }): { promise: Promise<void>; cancel(): void }
}

function isOcrPdfPage(page: PdfPageHandle): page is OcrPdfPage {
  return 'render' in page && typeof page.render === 'function'
}

export async function renderPdfPageForOcr(
  page: PdfPageHandle,
  signal: AbortSignal,
): Promise<PageImage> {
  signal.throwIfAborted()
  if (!isOcrPdfPage(page)) {
    throw new Error('PDF 페이지를 읽어올 수 없어 OCR을 수행할 수 없습니다.')
  }

  // 화면 확대율과 무관하게 일정한 인식 품질을 유지한다.
  const viewport = page.getViewport({ scale: OCR_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  try {
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('OCR Canvas를 만들 수 없습니다.')
    const task = page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: '#ffffff',
    })
    const cancel = () => task.cancel()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      if (signal.aborted) cancel()
      await task.promise
      signal.throwIfAborted()
    } finally {
      signal.removeEventListener('abort', cancel)
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    signal.throwIfAborted()
    if (!blob) throw new Error('OCR 이미지를 만들 수 없습니다.')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    signal.throwIfAborted()
    return { bytes, mimeType: 'image/png', width: canvas.width, height: canvas.height }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
