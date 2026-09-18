export interface OcrLine {
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

export function fitOcrLines(
  lines: readonly OcrLine[],
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
