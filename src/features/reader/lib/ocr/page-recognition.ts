import type { PdfPageHandle, PdfPageViewport } from '../pdf-document'
import { postprocessWithKiwi } from '../kiwi/client'
import { sortInReadingOrder } from './reading-order'
import { fitOcrLines, type OcrLine, type SelectableTextLine } from './textbox-layer'

// PDF의 72 DPI 좌표를 OCR에 사용할 200 DPI 픽셀 좌표로 변환한다.
const OCR_SCALE = 200 / 72
const PADDLE_WASM_PATH = import.meta.env.DEV
  ? '/src/assets/vendor/ocr/runtime/'
  : '/vendor/ocr/runtime/'

interface OcrRenderTask {
  promise: Promise<void>
  cancel(): void
}

interface OcrPdfPage extends PdfPageHandle {
  render(parameters: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: PdfPageViewport
    background: string
  }): OcrRenderTask
}

export interface OcrPageResult {
  width: number
  height: number
  lines: readonly SelectableTextLine[]
}

type PaddleOcr = Awaited<
  ReturnType<(typeof import('@paddleocr/paddleocr-js'))['PaddleOCR']['create']>
>

let paddle: Promise<PaddleOcr> | undefined

function isOcrPdfPage(page: PdfPageHandle): page is OcrPdfPage {
  return 'render' in page && typeof page.render === 'function'
}

async function renderPdfPageForOcr(page: PdfPageHandle, signal: AbortSignal) {
  if (!isOcrPdfPage(page)) {
    throw new Error('PDF 페이지를 읽어올 수 없어 OCR을 수행할 수 없습니다.')
  }

  signal.throwIfAborted()
  // 화면 확대율과 무관하게 일정한 인식 품질을 얻도록 별도 Canvas에 렌더링한다.
  const viewport = page.getViewport({ scale: OCR_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('OCR Canvas를 만들 수 없습니다.')
  }

  const renderTask = page.render({
    canvas,
    canvasContext: context,
    viewport,
    background: '#ffffff',
  })
  const cancelRender = () => renderTask.cancel()
  signal.addEventListener('abort', cancelRender, { once: true })

  try {
    await renderTask.promise
    signal.throwIfAborted()
    return { canvas, context }
  } catch (error) {
    canvas.width = 0
    canvas.height = 0
    throw error
  } finally {
    signal.removeEventListener('abort', cancelRender)
  }
}

async function getPaddle() {
  // 큰 모델을 페이지마다 다시 불러오지 않도록 초기화 Promise를 재사용한다.
  paddle ??= import('@paddleocr/paddleocr-js')
    .then(({ PaddleOCR }) =>
      PaddleOCR.create({
        worker: true,
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textDetectionModelAsset: {
          url: '/vendor/ocr/paddleocr/PP-OCRv5_mobile_det_onnx_infer.tar',
        },
        textRecognitionModelName: 'korean_PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: {
          url: '/vendor/ocr/paddleocr/korean_PP-OCRv5_mobile_rec_onnx_infer.tar',
        },
        textRecognitionBatchSize: 8,
        ortOptions: {
          backend: 'wasm',
          wasmPaths: PADDLE_WASM_PATH,
          numThreads: 1,
          simd: true,
        },
      }),
    )
    .catch((error: unknown) => {
      paddle = undefined
      throw error
    })
  return paddle
}

async function recognizeWithPaddleOcr(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<OcrLine[]> {
  // 작은 글자까지 탐지하되 신뢰도가 낮은 상자와 인식 결과는 제외한다.
  const [recognized] = await (
    await getPaddle()
  ).predict(canvas, {
    textDetLimitSideLen: 1_600,
    textDetLimitType: 'max',
    textDetMaxSideLimit: 3_000,
    textDetBoxThresh: 0.45,
    textRecScoreThresh: 0.25,
  })
  signal.throwIfAborted()

  // PaddleOCR의 사각형 꼭짓점을 텍스트 레이어가 사용할 축 정렬 좌표로 바꾼다.
  return recognized.items
    .filter(({ text }) => text.trim())
    .map(({ poly, text }) => ({
      text: text.trim(),
      bbox: {
        x0: Math.min(...poly.map(([x]) => x)),
        y0: Math.min(...poly.map(([, y]) => y)),
        x1: Math.max(...poly.map(([x]) => x)),
        y1: Math.max(...poly.map(([, y]) => y)),
      },
    }))
}

async function postprocessOcrLines(
  sourceLines: readonly OcrLine[],
  context: CanvasRenderingContext2D,
  signal: AbortSignal,
) {
  // 줄 순서를 유지해 Kiwi 결과를 원래 OCR 좌표와 다시 연결한다.
  const processed = await postprocessWithKiwi(
    sourceLines.map(({ text }) => text).join('\n'),
    signal,
  )
  const processedLines = processed.split('\n')

  return fitOcrLines(
    sourceLines.map((line, index) => ({
      ...line,
      text: processedLines[index] ?? line.text,
    })),
    (text, fontSize) => {
      context.font = `${fontSize}px sans-serif`
      return context.measureText(text).width
    },
  )
}

export async function recognizePdfPage(
  page: PdfPageHandle,
  signal: AbortSignal,
): Promise<OcrPageResult> {
  const { canvas, context } = await renderPdfPageForOcr(page, signal)

  try {
    const sourceLines = sortInReadingOrder(await recognizeWithPaddleOcr(canvas, signal))
    const lines = await postprocessOcrLines(sourceLines, context, signal)

    return { width: canvas.width, height: canvas.height, lines }
  } finally {
    // OCR이 끝난 고해상도 Canvas의 픽셀 메모리를 즉시 반환한다.
    canvas.width = 0
    canvas.height = 0
  }
}
