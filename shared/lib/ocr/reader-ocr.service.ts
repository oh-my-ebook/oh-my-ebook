import { measureSelectableTextLines } from './reader-ocr.util'
import type {
  OcrTextNormalizer,
  PageImage,
  PageTextLayer,
  RawPageText,
  ReaderOcrClient,
  TextBox,
} from './reader-ocr.types'
import { sortInReadingOrder } from './reading-order'

export class ReaderOcrService {
  private readonly ocrClient: ReaderOcrClient
  private readonly textNormalizer: OcrTextNormalizer
  constructor(ocrClient: ReaderOcrClient, textNormalizer: OcrTextNormalizer) {
    this.ocrClient = ocrClient
    this.textNormalizer = textNormalizer
  }

  async init(): Promise<void> {
    await Promise.all([
      this.ocrClient.initOcr(),
      this.textNormalizer.normalizeText('', new AbortController().signal),
    ])
  }

  async readImage(image: PageImage, signal: AbortSignal): Promise<PageTextLayer> {
    const result = await this.recognize(image, signal)
    const lines = await this.postprocessText(result.lines, signal)

    return { width: result.width, height: result.height, lines }
  }

  async postprocessPage(page: RawPageText, signal: AbortSignal): Promise<PageTextLayer> {
    signal.throwIfAborted()
    // 저장된 줄 순서가 선택 순서와 출처 연결의 기준이므로 다시 정렬하지 않는다.
    const lines = await this.postprocessText(page.lines, signal)
    return { width: page.width, height: page.height, lines }
  }

  async recognize(image: PageImage, signal: AbortSignal): Promise<RawPageText> {
    // 1. OCR 수행
    signal.throwIfAborted()
    const rawLines = await this.ocrClient.recognize(image, signal)

    // 2. OCR 결과 읽기 순서로 정렬(양쪽 보기, 세로 읽기 등)
    signal.throwIfAborted()
    const lines = sortInReadingOrder(rawLines)

    return { width: image.width, height: image.height, lines }
  }

  private async postprocessText(textBoxes: readonly TextBox[], signal: AbortSignal) {
    // 줄 단위 좌표를 보존하기 위해 정규화한 텍스트를 원래 줄 순서에 맞춘다.
    const ocrLines = textBoxes.map(({ text }) => text).join('\n')
    const normalizedOcrText = await this.textNormalizer.normalizeText(ocrLines, signal)
    const normalizedLines = normalizedOcrText.split('\n')
    const normalizedTextBoxes = textBoxes.map((textBox, index) => ({
      ...textBox,
      text: normalizedLines[index] ?? textBox.text,
    }))

    // 2. 원래 좌표에 맞춰 PDF 텍스트 레이어 크기 계산
    signal.throwIfAborted()
    const selectableTextLines = measureSelectableTextLines(normalizedTextBoxes)

    return selectableTextLines
  }
}
