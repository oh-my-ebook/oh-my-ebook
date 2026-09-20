export interface TextBox {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
  rowHeight?: number
}

export interface SelectableTextLine {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
  fontSize: number
  scaleX: number
}

export interface PageTextLayer {
  width: number
  height: number
  lines: readonly SelectableTextLine[]
}

export function toBoundingBox(points: readonly (readonly [number, number])[]): TextBox['bbox'] {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** 화면에 그리지 않는 Canvas로 글자 폭을 재는 함수를 만든다. */
export function createTextMeasurer() {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) {
    throw new Error('텍스트 측정용 Canvas를 만들 수 없습니다.')
  }

  return (text: string, fontSize: number) => {
    context.font = `${fontSize}px sans-serif`
    return context.measureText(text).width
  }
}

/** 글자 상자를 그 안에 꽉 차 보이는 한 줄 텍스트 크기로 맞춘다. */
export function fitTextLines(
  lines: readonly TextBox[],
  measure: (text: string, fontSize: number) => number,
): SelectableTextLine[] {
  return lines.flatMap(({ text: source, bbox, rowHeight }) => {
    const text = source.trim()
    const width = bbox.x1 - bbox.x0
    const height = bbox.y1 - bbox.y0
    if (!text || width <= 0 || height <= 0) {
      return []
    }

    const fontSize = Math.max(1, Math.min(height, rowHeight ?? height))
    const measuredWidth = measure(text, fontSize)
    const scaleX = measuredWidth > 0 ? Math.min(4, Math.max(0.25, width / measuredWidth)) : 1
    return [{ text, ...bbox, fontSize, scaleX }]
  })
}
