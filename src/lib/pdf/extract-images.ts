import { OPS } from 'pdfjs-dist'
import type { PdfPageHandle, PdfPointViewport } from './document'
import { toBoundingBox, type BoundingBox } from './text-layout'

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

interface PdfOperatorList {
  fnArray: readonly number[]
  argsArray: readonly unknown[]
}

interface ImagePdfPage extends PdfPageHandle {
  getOperatorList(): Promise<PdfOperatorList>
  getViewport(parameters: { scale: number }): PdfPointViewport
}

export interface PageImageRegions {
  width: number
  height: number
  regions: readonly BoundingBox[]
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
  const pending = boxes.map((box, order) => ({ box, order })).toReversed()
  const merged: { box: BoundingBox; order: number }[] = []

  while (pending.length > 0) {
    const current = pending.pop()
    if (!current) {
      break
    }
    const adjacentIndex = merged.findIndex(({ box }) => isAdjacent(box, current.box))
    if (adjacentIndex === -1) {
      merged.push(current)
      continue
    }

    const [adjacent] = merged.splice(adjacentIndex, 1)
    pending.push({
      box: unionBox(adjacent.box, current.box),
      order: Math.min(adjacent.order, current.order),
    })
  }

  return merged.toSorted((a, b) => a.order - b.order).map(({ box }) => box)
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
