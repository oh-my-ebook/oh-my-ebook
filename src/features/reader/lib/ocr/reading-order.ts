import type { OcrLine } from './textbox-layer'

// 줄 높이 중앙값의 몇 배 이상 비어 있어야 페이지·카드 같은 영역 경계로 볼지 정한다.
// 줄 간격이나 번호와 본문 사이 간격은 이보다 좁고, 양면 캡처의 가운데 여백은 훨씬 넓다.
const BLOCK_GAP_RATIO = 2.5

// 어떤 줄도 걸치지 않는 빈 띠가 minGap 이상인 곳에서 줄 묶음을 나눈다.
function splitAtGaps(lines: readonly OcrLine[], axis: 'x' | 'y', minGap: number) {
  const start = axis === 'x' ? 'x0' : 'y0'
  const end = axis === 'x' ? 'x1' : 'y1'
  const groups: OcrLine[][] = []
  let reach = 0
  for (const line of lines.toSorted((a, b) => a.bbox[start] - b.bbox[start])) {
    const last = groups.at(-1)
    if (last && line.bbox[start] - reach < minGap) {
      last.push(line)
    } else {
      groups.push([line])
    }
    reach = Math.max(reach, line.bbox[end])
  }
  return groups
}

// 재귀 XY-cut: 행을 먼저 나눠 카드 격자는 행 순서로 읽고,
// 가로로 이어지는 빈 띠가 없는 양면 캡처는 세로 여백에서 페이지별로 나눈다.
function orderBlock(lines: readonly OcrLine[], minGap: number): OcrLine[] {
  for (const axis of ['y', 'x'] as const) {
    const groups = splitAtGaps(lines, axis, minGap)
    if (groups.length > 1) {
      return groups.flatMap((group) => orderBlock(group, minGap))
    }
  }
  // 넓은 여백으로 더 나눌 수 없는 영역은 좁은 간격까지 나눠 줄 순서와 같은 줄 안의 순서를 정한다.
  if (minGap > 0) {
    return orderBlock(lines, 0)
  }
  return lines.toSorted((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
}

// PaddleOCR은 y 좌표 순으로 줄을 돌려주므로 여러 단이 있으면 좌우 줄이 섞인다.
// 텍스트 레이어의 DOM 순서가 드래그 선택 순서가 되므로 읽기 순서로 다시 정렬한다.
export function sortInReadingOrder(lines: readonly OcrLine[]): OcrLine[] {
  const heights = lines.map(({ bbox }) => bbox.y1 - bbox.y0).toSorted((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 0
  return orderBlock(lines, medianHeight * BLOCK_GAP_RATIO)
}
