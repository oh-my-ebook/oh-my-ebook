import type { BoundingBox, SelectableTextLine, TextBox, TextMeasurer } from './reader-ocr.types'

export function createTextMeasurer(): TextMeasurer {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('텍스트 측정용 Canvas를 만들 수 없습니다.')

  const measurer = (text: string, fontSize: number) => {
    context.font = `${fontSize}px sans-serif`
    return context.measureText(text).width
  }

  return measurer
}

export function toBoundingBox(points: readonly (readonly [number, number])[]): BoundingBox {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export function measureSelectableTextLines(textBoxes: readonly TextBox[]): SelectableTextLine[] {
  const measurer: TextMeasurer = createTextMeasurer()
  const selectableTextLines: SelectableTextLine[] = textBoxes.flatMap(
    ({ text: source, bbox, rowHeight }) => {
      const text = source.trim()
      const width = bbox.x1 - bbox.x0
      const height = bbox.y1 - bbox.y0
      if (!text || width <= 0 || height <= 0) return []

      const fontSize = Math.max(1, Math.min(height, rowHeight ?? height))
      const measuredWidth = measurer(text, fontSize)
      const scaleX = measuredWidth > 0 ? Math.min(4, Math.max(0.25, width / measuredWidth)) : 1
      return [{ text, ...bbox, fontSize, scaleX }]
    },
  )

  return selectableTextLines
}
