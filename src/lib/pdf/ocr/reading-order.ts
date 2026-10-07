import type { TextBox } from '../text-layer'

// 줄 높이 중앙값의 몇 배 이상 비어 있어야 페이지·카드 같은 영역 경계로 볼지 정한다.
// 줄 간격이나 번호와 본문 사이 간격은 이보다 좁고, 양면 캡처의 가운데 여백은 훨씬 넓다.
const BLOCK_GAP_RATIO = 2.5

// 어떤 줄도 걸치지 않는 빈 띠가 minGap 이상인 곳에서 줄 묶음을 나눈다.
function splitAtGaps(lines: readonly TextBox[], axis: 'x' | 'y', minGap: number) {
  const start = axis === 'x' ? 'x0' : 'y0'
  const end = axis === 'x' ? 'x1' : 'y1'
  const groups: TextBox[][] = []
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
function orderBlock(lines: readonly TextBox[], minGap: number): TextBox[] {
  for (const axis of ['y', 'x'] as const) {
    const groups = splitAtGaps(lines, axis, minGap)
    if (groups.length > 1) {
      return groups.flatMap((group) => orderBlock(group, minGap))
    }
  }
  // 넓은 여백으로 더 나눌 수 없는 영역은 좁은 단 사이 여백을 찾아보고,
  // 없으면 좁은 간격까지 나눠 줄 순서와 같은 줄 안의 순서를 정한다.
  if (minGap > 0) {
    return orderAroundGutter(lines, minGap) ?? orderBlock(lines, 0)
  }
  return lines.toSorted((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
}

interface Gutter {
  x0: number
  x1: number
}

// 줄 높이 이상 넓으면서 가로지르는 줄이 가장 적은 세로 띠를 단 사이 여백으로 본다.
// 머리말·꼬리말이 여백을 가로질러 빈 띠가 끊겨도 단을 찾기 위해 몇 줄은 가로질러도 허용한다.
function findGutter(lines: readonly TextBox[], minWidth: number): Gutter | undefined {
  const events = lines
    .flatMap(({ bbox }) => [
      { x: bbox.x0, step: 1 },
      { x: bbox.x1, step: -1 },
    ])
    .toSorted((a, b) => a.x - b.x || a.step - b.step)
  const segments: (Gutter & { crossing: number })[] = []
  let crossing = 0
  events.forEach(({ x, step }, index) => {
    crossing += step
    const next = events[index + 1]
    if (next && next.x > x) {
      segments.push({ x0: x, x1: next.x, crossing })
    }
  })

  const leftmostEnd = lines.reduce((min, { bbox }) => Math.min(min, bbox.x1), Infinity)
  const rightmostStart = lines.reduce((max, { bbox }) => Math.max(max, bbox.x0), -Infinity)
  const maxCrossing = Math.max(2, lines.length / 10)
  const limits = [...new Set(segments.map((segment) => segment.crossing))].toSorted((a, b) => a - b)
  // 가로지르는 줄이 적은 띠부터 찾아야 단 안쪽의 들쭉날쭉한 줄 끝을 여백으로 잘못 보지 않는다.
  for (const limit of limits.filter((value) => value <= maxCrossing)) {
    const candidates: Gutter[] = []
    let open: Gutter | undefined
    for (const segment of segments) {
      if (segment.crossing > limit) {
        open = undefined
      } else if (open) {
        open.x1 = segment.x1
      } else {
        open = { x0: segment.x0, x1: segment.x1 }
        candidates.push(open)
      }
    }
    const [widest] = candidates
      .filter(({ x0, x1 }) => x1 - x0 >= minWidth && leftmostEnd <= x0 && x1 <= rightmostStart)
      .toSorted((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))
    if (widest) {
      return widest
    }
  }
}

// 좌우 줄이 같은 높이에 짝지어 있으면(번호 목록, 표, 한 줄이 둘로 나뉜 경우) 단이 아니라 행으로 본다.
// 모든 쌍을 비교하지만 한 페이지의 줄 수(수백 개)에서는 1ms 안팎이라 정렬 기반 탐색을 쓰지 않는다.
function isRowAligned(left: readonly TextBox[], right: readonly TextBox[], lineHeight: number) {
  const [fewer, more] = left.length <= right.length ? [left, right] : [right, left]
  const centerY = ({ bbox }: TextBox) => (bbox.y0 + bbox.y1) / 2
  const paired = fewer.filter((a) =>
    more.some((b) => Math.abs(centerY(a) - centerY(b)) <= lineHeight / 4),
  )
  return paired.length * 2 > fewer.length
}

// 여러 줄이 쌓인 넓은 글 덩어리인지 본다. 번호·라벨처럼 좁거나 2×2 보기처럼 줄이 적으면 아니다.
// 기준(3줄, 줄 높이의 8배 너비)은 좁은 3단 잡지 한 줄(10자 안팎)도 통과하도록 정했다.
function isTextColumn(lines: readonly TextBox[], lineHeight: number) {
  const widths = lines.map(({ bbox }) => bbox.x1 - bbox.x0).toSorted((a, b) => a - b)
  const medianWidth = widths[Math.floor(widths.length / 2)] ?? 0
  return lines.length >= 3 && medianWidth >= lineHeight * 8
}

interface Section {
  lines: TextBox[]
  crossing: boolean
}

// 세로 2단 문서처럼 단 사이 여백이 좁은 영역을 단 순서로 읽는다.
// 여백을 가로지르는 줄이 있는 행(머리말·꼬리말·제목)은 제자리에서 따로 읽고,
// 그 사이 구간은 좌우 줄 높이가 서로 어긋나 독립된 단으로 보일 때만 왼쪽 단부터 읽는다.
function orderAroundGutter(lines: readonly TextBox[], minGap: number): TextBox[] | undefined {
  const lineHeight = minGap / BLOCK_GAP_RATIO
  const gutter = findGutter(lines, lineHeight)
  if (!gutter) {
    return undefined
  }

  const crosses = ({ bbox }: TextBox) => bbox.x0 < gutter.x1 && bbox.x1 > gutter.x0
  const sections: Section[] = []
  for (const row of splitAtGaps(lines, 'y', 0)) {
    const crossing = row.some(crosses)
    const last = sections.at(-1)
    if (last && !last.crossing && !crossing) {
      last.lines.push(...row)
    } else {
      sections.push({ lines: row, crossing })
    }
  }

  const splitColumns = (section: Section) => {
    const left = section.lines.filter(({ bbox }) => bbox.x1 <= gutter.x0)
    const right = section.lines.filter(({ bbox }) => bbox.x0 >= gutter.x1)
    // 줄 높이가 맞으면 행 구조로 보되, 양쪽이 모두 글 덩어리면 행간이 같은 조판의 단으로 본다.
    const isColumns =
      !section.crossing &&
      (!isRowAligned(left, right, lineHeight) ||
        (isTextColumn(left, lineHeight) && isTextColumn(right, lineHeight)))
    return isColumns ? [...orderBlock(left, minGap), ...orderBlock(right, minGap)] : undefined
  }

  // 구간이 하나뿐이면 단으로 나눌 수 있을 때만 처리하고, 아니면 다음 단계에 맡긴다.
  if (sections.length === 1) {
    return splitColumns(sections[0])
  }
  return sections.flatMap((section) => splitColumns(section) ?? orderBlock(section.lines, 0))
}

// PaddleOCR은 y 좌표 순으로 줄을 돌려주므로 여러 단이 있으면 좌우 줄이 섞인다.
// 텍스트 레이어의 DOM 순서가 드래그 선택 순서가 되므로 읽기 순서로 다시 정렬한다.
export function sortInReadingOrder(lines: readonly TextBox[]): TextBox[] {
  const heights = lines.map(({ bbox }) => bbox.y1 - bbox.y0).toSorted((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 0
  return orderBlock(lines, medianHeight * BLOCK_GAP_RATIO)
}
