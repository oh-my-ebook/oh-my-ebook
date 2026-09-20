import {
  GlobalWorkerOptions,
  InvalidPDFException,
  OPS,
  PasswordException,
  getDocument,
} from 'pdfjs-dist'

// Vite의 `?url`로 현재 PDF.js 패키지에 포함된 worker 파일의 배포 URL을 가져온다.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  createTextMeasurer,
  fitTextLines,
  toBoundingBox,
  type BoundingBox,
  type PageTextLayer,
  type TextBox,
} from './text-layer'

// PDF.js가 문서 분석을 별도 worker에서 수행하도록 worker 스크립트 경로를 지정한다.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// PDF의 1/72인치 포인트를 CSS의 1/96인치 픽셀 기준으로 변환하는 배율이다.
export const PDF_CSS_SCALE = 96 / 72

// 이미지는 단위 정사각형을 변환 행렬로 펼친 자리에 그려진다.
const IMAGE_UNIT_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const
const IMAGE_PAINT_OPS = new Set([
  OPS.paintImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintInlineImageXObject,
])
// 페이지를 이만큼 덮는 이미지는 스캔 원본이라 영역으로 표시할 의미가 없다.
const SCANNED_PAGE_RATIO = 0.9
// 아이콘이나 불릿처럼 작은 이미지는 영역으로 표시하지 않는다.
const MIN_IMAGE_SIZE = 24
// 한 그림이 조각으로 나뉘어 그려졌는지 판단하는 조각 사이 간격이다.
const IMAGE_MERGE_GAP = 2
// 복사한 이미지가 화면 배율과 무관하게 선명하도록 2배로 그린다.
const IMAGE_COPY_SCALE = 2

export type PdfDocumentErrorKind =
  'invalid-document' | 'load-failed' | 'page-info' | 'password-required'

const errorMessages: Record<PdfDocumentErrorKind, string> = {
  'invalid-document': '손상되었거나 올바르지 않은 PDF입니다.',
  'load-failed': 'PDF를 불러오지 못했습니다.',
  'page-info': 'PDF 페이지 정보를 불러오지 못했습니다.',
  'password-required': '암호가 필요한 PDF는 열 수 없습니다.',
}

export class PdfDocumentError extends Error {
  readonly kind: PdfDocumentErrorKind

  constructor(kind: PdfDocumentErrorKind, cause?: unknown) {
    super(errorMessages[kind], { cause })
    this.name = 'PdfDocumentError'
    this.kind = kind
  }
}

export interface PdfPageViewport {
  width: number
  height: number
  rotation: number
}

export interface PdfPageHandle {
  getViewport(parameters: { scale: number }): PdfPageViewport
}

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
}

interface PdfPointViewport extends PdfPageViewport {
  convertToViewportPoint(x: number, y: number): [number, number]
}

interface TextPdfPage extends PdfPageHandle {
  getTextContent(): Promise<{ items: readonly PdfTextItem[] }>
  getViewport(parameters: { scale: number }): PdfPointViewport
}

interface PdfOperatorList {
  fnArray: readonly number[]
  argsArray: readonly unknown[]
}

interface ImagePdfPage extends PdfPageHandle {
  getOperatorList(): Promise<PdfOperatorList>
  getViewport(parameters: { scale: number }): PdfPointViewport
}

export interface PdfRenderParameters {
  canvas: HTMLCanvasElement
  viewport: PdfPageViewport
  transform?: number[]
  background?: string
}

export interface PdfRenderTask {
  readonly promise: Promise<void>
  cancel(): void
}

export interface RenderablePdfPage extends PdfPageHandle {
  render(parameters: PdfRenderParameters): PdfRenderTask
}

export interface PageImageRegions {
  width: number
  height: number
  regions: readonly BoundingBox[]
}

export interface PdfDocumentHandle {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfPageHandle>
}

export interface PdfPageInfo {
  pageNumber: number
  width: number
  height: number
  rotation: number
}

export interface LoadedPdfDocument {
  document: PdfDocumentHandle
  pages: readonly PdfPageInfo[]
}

export type PdfDocumentSource = string | Uint8Array

export type PdfDocumentLoader = (
  source: PdfDocumentSource,
  signal: AbortSignal,
) => Promise<LoadedPdfDocument>

function isTextPdfPage(page: PdfPageHandle): page is TextPdfPage {
  return 'getTextContent' in page && typeof page.getTextContent === 'function'
}

export function isRenderablePdfPage(page: PdfPageHandle): page is RenderablePdfPage {
  return 'render' in page && typeof page.render === 'function'
}

function isImagePdfPage(page: PdfPageHandle): page is ImagePdfPage {
  return 'getOperatorList' in page && typeof page.getOperatorList === 'function'
}

type Matrix = readonly [number, number, number, number, number, number]

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0]

function toMatrix(value: unknown): Matrix | null {
  if (!Array.isArray(value) || value.length !== 6 || value.some((n) => typeof n !== 'number')) {
    return null
  }
  const [a, b, c, d, e, f] = value
  return [a, b, c, d, e, f]
}

function combineMatrix(outer: Matrix, inner: Matrix): Matrix {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
  ]
}

function applyMatrix(matrix: Matrix, x: number, y: number): [number, number] {
  return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]
}

/** 페이지를 그리는 명령을 따라가며 이미지가 그려진 자리를 모은다. */
function collectImageBoxes(
  { fnArray, argsArray }: PdfOperatorList,
  viewport: PdfPointViewport,
): BoundingBox[] {
  const boxes: BoundingBox[] = []
  const matrixStack: Matrix[] = []
  let currentMatrix = IDENTITY_MATRIX

  fnArray.forEach((operator, index) => {
    // Form XObject와 투명 그룹은 자체 행렬을 가진 채 그 안에서 다시 그린다.
    const isNestedDrawingStart =
      operator === OPS.paintFormXObjectBegin || operator === OPS.beginGroup
    const isNestedDrawingEnd = operator === OPS.paintFormXObjectEnd || operator === OPS.endGroup

    if (operator === OPS.save) {
      matrixStack.push(currentMatrix)
    } else if (operator === OPS.restore || isNestedDrawingEnd) {
      currentMatrix = matrixStack.pop() ?? currentMatrix
    } else if (operator === OPS.transform) {
      currentMatrix = combineMatrix(currentMatrix, toMatrix(argsArray[index]) ?? IDENTITY_MATRIX)
    } else if (isNestedDrawingStart) {
      matrixStack.push(currentMatrix)
      const nestedMatrix = toMatrix(
        Array.isArray(argsArray[index]) ? argsArray[index][0] : undefined,
      )
      currentMatrix = nestedMatrix ? combineMatrix(currentMatrix, nestedMatrix) : currentMatrix
    } else if (IMAGE_PAINT_OPS.has(operator)) {
      const matrix = currentMatrix
      boxes.push(
        toBoundingBox(
          IMAGE_UNIT_CORNERS.map(([x, y]) => {
            const [pdfX, pdfY] = applyMatrix(matrix, x, y)
            return viewport.convertToViewportPoint(pdfX, pdfY)
          }),
        ),
      )
    }
  })

  return boxes
}

function isAdjacent(a: BoundingBox, b: BoundingBox) {
  return (
    a.x0 <= b.x1 + IMAGE_MERGE_GAP &&
    b.x0 <= a.x1 + IMAGE_MERGE_GAP &&
    a.y0 <= b.y1 + IMAGE_MERGE_GAP &&
    b.y0 <= a.y1 + IMAGE_MERGE_GAP
  )
}

function unionBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

/** 한 그림이 여러 조각으로 그려진 경우가 많아, 맞닿은 조각을 하나로 합친다. */
function mergeAdjacentBoxes(boxes: readonly BoundingBox[]): BoundingBox[] {
  const merged = boxes.reduce<BoundingBox[]>((result, box) => {
    const adjacentIndex = result.findIndex((candidate) => isAdjacent(candidate, box))
    if (adjacentIndex === -1) {
      return [...result, box]
    }
    return result.map((candidate, index) =>
      index === adjacentIndex ? unionBox(candidate, box) : candidate,
    )
  }, [])

  // 합치면서 커진 상자가 다른 상자와 새로 맞닿을 수 있어 변화가 없을 때까지 반복한다.
  return merged.length === boxes.length ? merged : mergeAdjacentBoxes(merged)
}

/**
 * PDF에 그림으로 들어 있는 영역을 찾는다.
 * 페이지 전체를 덮는 스캔 이미지와 아이콘 크기의 이미지는 제외한다.
 */
export async function extractPdfPageImages(
  page: PdfPageHandle,
  signal: AbortSignal,
): Promise<PageImageRegions | null> {
  if (!isImagePdfPage(page)) {
    return null
  }
  const viewport = page.getViewport({ scale: 1 })
  const operatorList = await page.getOperatorList()
  signal.throwIfAborted()

  const pageArea = viewport.width * viewport.height
  const regions = mergeAdjacentBoxes(collectImageBoxes(operatorList, viewport)).filter((box) => {
    const width = box.x1 - box.x0
    const height = box.y1 - box.y0
    if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) {
      return false
    }
    return (width * height) / pageArea < SCANNED_PAGE_RATIO
  })

  return { width: viewport.width, height: viewport.height, regions }
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

/** `instanceof` 대신 오류 객체의 `name`이 예상한 PDF.js 오류 이름과 일치하는지 안전하게 확인한다. */
function hasErrorName(error: unknown, expectedName: string) {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === expectedName
  )
}

/** PDF.js 오류를 화면에서 처리할 수 있는 애플리케이션 오류 종류인 `PdfDocumentError`로 변환한다. */
export function toPdfDocumentError(error: unknown) {
  if (error instanceof PdfDocumentError) {
    return error
  }
  if (error instanceof PasswordException || hasErrorName(error, 'PasswordException')) {
    return new PdfDocumentError('password-required', error)
  }
  if (error instanceof InvalidPDFException || hasErrorName(error, 'InvalidPDFException')) {
    return new PdfDocumentError('invalid-document', error)
  }
  return new PdfDocumentError('load-failed', error)
}

/** PDF의 모든 페이지에서 렌더링에 필요한 크기와 회전 정보를 수집한다. */
async function preparePdfDocument(document: PdfDocumentHandle): Promise<LoadedPdfDocument> {
  const pages: PdfPageInfo[] = []

  try {
    // 렌더링 전에 모든 페이지의 크기와 회전값을 CSS 픽셀 기준으로 수집한다.
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: PDF_CSS_SCALE })
      if (
        !Number.isFinite(viewport.width) ||
        viewport.width <= 0 ||
        !Number.isFinite(viewport.height) ||
        viewport.height <= 0 ||
        !Number.isFinite(viewport.rotation)
      ) {
        throw new Error(`Invalid page viewport for page ${pageNumber}`)
      }
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      })
    }
  } catch (error) {
    throw new PdfDocumentError('page-info', error)
  }

  return { document, pages }
}

/** URL의 PDF를 불러오고 취소 신호에 맞춰 로딩 작업과 자원을 정리한다. */
export const loadPdfDocument: PdfDocumentLoader = async (source, signal) => {
  signal.throwIfAborted()
  // PDF.js는 자체 Worker로 Uint8Array 버퍼를 전송한다. 개발 모드의 effect 재실행과
  // 재시도에서도 같은 원본을 안전하게 사용할 수 있도록 전송용 사본을 만든다.
  const documentSource = typeof source === 'string' ? { url: source } : { data: source.slice() }
  const loadingTask = getDocument(documentSource)
  let destroyPromise: Promise<void> | undefined
  // 취소와 오류 처리가 겹쳐도 PDF.js 로딩 작업은 한 번만 정리한다.
  const destroy = async () => {
    destroyPromise ??= loadingTask.destroy()
    await destroyPromise
  }
  const handleAbort = () => {
    void destroy().catch(() => undefined)
  }

  signal.addEventListener('abort', handleAbort, { once: true })

  try {
    const document = await loadingTask.promise
    signal.throwIfAborted()
    const loadedDocument = await preparePdfDocument(document)
    signal.throwIfAborted()
    return loadedDocument
  } catch (error) {
    // 이후의 abort 이벤트가 이미 끝난 로딩 작업을 다시 정리하지 않도록 구독을 해제한다.
    signal.removeEventListener('abort', handleAbort)

    let cleanupError: unknown
    try {
      await destroy()
    } catch (destroyError) {
      cleanupError = destroyError
    }

    signal.throwIfAborted()
    const documentError = toPdfDocumentError(error)
    if (cleanupError !== undefined) {
      // 원래 로딩 오류와 정리 중 발생한 오류를 모두 원인으로 남긴다.
      throw new PdfDocumentError(
        documentError.kind,
        new AggregateError([documentError, cleanupError]),
      )
    }
    throw documentError
  }
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
