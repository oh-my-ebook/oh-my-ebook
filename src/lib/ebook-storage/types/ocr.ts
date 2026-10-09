export interface OcrLineInput {
  rawText: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface NextOcrPage {
  id: string
  pageNumber: number
}

export interface OcrLineRecord {
  page_number: number
  line_index: number
  raw_text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrLinePage {
  lines: OcrLineRecord[]
  total: number
}

export interface OcrLineForChunking {
  ocr_page_id: string
  page_number: number
  line_index: number
  raw_text: string
}

export interface StoredOcrPage {
  width: number
  height: number
  lines: OcrLineInput[]
}

export interface OcrPageRecord {
  page_number: number
  status: 'pending' | 'processing' | 'ready' | 'failed'
  width: number | null
  height: number | null
}
