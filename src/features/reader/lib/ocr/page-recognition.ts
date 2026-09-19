import type { PdfPageHandle, PdfPageViewport } from '../pdf-document'
import { postprocessWithKiwi } from '../kiwi/client'
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

export interface RawOcrPageResult {
  width: number
  height: number
  lines: readonly OcrLine[]
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

function getPaddle() {
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

// PaddleOCR worker 인스턴스에는 predict() 취소 API가 없어, 중단된 인스턴스는 캐시에서
// 즉시 떼어내 다음 페이지가 새 인스턴스로 바로 시작하게 한다. 인스턴스가 이미 만들어져
// 있었다면 dispose()가 그 자리에서 Worker를 종료시켜 진행 중이던 predict()도 함께
// 끊어지고, 아직 초기화 중이었다면 초기화가 끝난 뒤에 정리된다.
function abandonPaddle(instancePromise: Promise<PaddleOcr>) {
  if (paddle === instancePromise) {
    paddle = undefined
  }
  instancePromise.then((instance) => instance.dispose()).catch(() => {})
}

function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<T> {
  if (signal.aborted) {
    onAbort()
    // abandonPaddle()의 dispose()가 이 promise를 거부시킬 수 있으므로, 아무도
    // 구독하지 않는 unhandled rejection이 되지 않도록 미리 처리해 둔다.
    promise.catch(() => {})
    return Promise.reject(signal.reason)
  }

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => {
      onAbort()
      reject(signal.reason)
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', handleAbort))
  })
}

async function recognizeWithPaddleOcr(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<OcrLine[]> {
  const instancePromise = getPaddle()
  // 작은 글자까지 탐지하되 신뢰도가 낮은 상자와 인식 결과는 제외한다.
  const [recognized] = await raceWithAbort(
    instancePromise.then((instance) =>
      instance.predict(canvas, {
        textDetLimitSideLen: 1_600,
        textDetLimitType: 'max',
        textDetMaxSideLimit: 3_000,
        textDetBoxThresh: 0.45,
        textRecScoreThresh: 0.25,
      }),
    ),
    signal,
    () => abandonPaddle(instancePromise),
  )

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
    const sourceLines = await recognizeWithPaddleOcr(canvas, signal)
    const lines = await postprocessOcrLines(sourceLines, context, signal)

    return { width: canvas.width, height: canvas.height, lines }
  } finally {
    // OCR이 끝난 고해상도 Canvas의 픽셀 메모리를 즉시 반환한다.
    canvas.width = 0
    canvas.height = 0
  }
}

export async function recognizePdfPageRaw(
  page: PdfPageHandle,
  signal: AbortSignal,
): Promise<RawOcrPageResult> {
  const { canvas } = await renderPdfPageForOcr(page, signal)

  try {
    return {
      width: canvas.width,
      height: canvas.height,
      lines: await recognizeWithPaddleOcr(canvas, signal),
    }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

export async function postprocessStoredOcrPage(
  page: StoredOcrPageResult,
  signal: AbortSignal,
): Promise<OcrPageResult> {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('OCR Canvas를 만들 수 없습니다.')

  const sourceLines = page.lines.map(({ rawText, x0, y0, x1, y1 }) => ({
    text: rawText,
    bbox: { x0, y0, x1, y1 },
  }))
  const lines = await postprocessOcrLines(sourceLines, context, signal)
  return { width: page.width, height: page.height, lines }
}
