export interface BoundingBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TextBox {
  text: string
  bbox: BoundingBox
  rowHeight?: number
}

export interface PageImage {
  bytes: Uint8Array
  mimeType: 'image/png'
  width: number
  height: number
}

export interface RawPageText {
  width: number
  height: number
  lines: readonly TextBox[]
}

export interface SelectableTextLine extends BoundingBox {
  text: string
  fontSize: number
  scaleX: number
}

export interface PageTextLayer {
  width: number
  height: number
  lines: readonly SelectableTextLine[]
}

export interface TextMeasurer {
  (text: string, fontSize: number): number
}

export interface StoredOcrPageResult {
  width: number
  height: number
  lines: readonly {
    rawText: string
    x0: number
    y0: number
    x1: number
    y1: number
  }[]
}

export interface ReaderOcrClient {
  initOcr(): Promise<void>
  recognize(image: PageImage, signal: AbortSignal): Promise<readonly TextBox[]>
}

export interface OcrTextNormalizer {
  normalizeText(text: string, signal: AbortSignal): Promise<string>
}
