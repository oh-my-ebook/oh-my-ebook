import type { PdfPageHandle, PdfPointViewport } from './document'
import {
  createTextMeasurer,
  fitTextLines,
  toBoundingBox,
  type PageTextLayer,
  type TextBox,
} from './text-layout'

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

interface TextPdfPage extends PdfPageHandle {
  getTextContent(): Promise<{ items: readonly PdfTextItem[] }>
  getViewport(parameters: { scale: number }): PdfPointViewport
}

function isTextPdfPage(page: PdfPageHandle): page is TextPdfPage {
  return 'getTextContent' in page && typeof page.getTextContent === 'function'
}

/**
 * PDF에 들어 있는 텍스트를 선택할 수 있는 텍스트 레이어로 바꾼다.
 * 글자가 없는 스캔 페이지나 회전된 페이지처럼 그대로 쓸 수 없으면 `null`을 반환한다.
 */
export async function extractPdfPageText(
  page: PdfPageHandle,
  signal: AbortSignal,
): Promise<PageTextLayer | null> {
  if (!isTextPdfPage(page)) {
    return null
  }
  const viewport = page.getViewport({ scale: 1 })
  const isRotatedPage = viewport.rotation !== 0
  if (isRotatedPage) {
    return null
  }

  const { items } = await page.getTextContent()
  signal.throwIfAborted()
  const textItems = items.filter(({ str }) => str.trim())
  if (textItems.length === 0) {
    return null
  }

  const textBoxes = textItems.map(({ str, transform, width, height }): TextBox => {
    const [left, baseline] = transform.slice(4)
    const bottomLeft = viewport.convertToViewportPoint(left, baseline)
    const topRight = viewport.convertToViewportPoint(left + width, baseline + height)
    return { text: str, bbox: toBoundingBox([bottomLeft, topRight]) }
  })

  return {
    width: viewport.width,
    height: viewport.height,
    lines: fitTextLines(textBoxes, createTextMeasurer()),
  }
}
