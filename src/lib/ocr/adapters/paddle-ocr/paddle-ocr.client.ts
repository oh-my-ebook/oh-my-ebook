import type {
  BoundingBox,
  PageImage,
  ReaderOcrClient,
  TextBox,
} from '@shared/lib/ocr/reader-ocr.types'
import { PaddleOcrProvider } from './paddle-ocr.provider'

function toBoundingBox(points: readonly (readonly [number, number])[]): BoundingBox {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export class PaddleOcrClient implements ReaderOcrClient {
  private readonly provider = new PaddleOcrProvider()
  private activeRequests = 0

  async initOcr(): Promise<void> {
    await this.provider.getInstance()
  }

  async recognize(image: PageImage, signal: AbortSignal): Promise<readonly TextBox[]> {
    signal.throwIfAborted()

    const instancePromise = this.provider.getInstance()
    this.activeRequests += 1
    let aborted = false
    const onAbort = () => {
      aborted = true
      this.activeRequests -= 1
      if (this.activeRequests === 0) {
        this.provider.abandon(instancePromise)
      }
    }

    try {
      const input = new Blob([image.bytes.slice().buffer], { type: image.mimeType })

      const [result] = await this.raceWithAbort(
        instancePromise.then((instance) => {
          signal.throwIfAborted()
          return instance.predict(input, {
            textDetLimitSideLen: 1_216,
            textDetLimitType: 'max',
            textDetMaxSideLimit: 3_000,
            textDetBoxThresh: 0.45,
            textRecScoreThresh: 0.25,
          })
        }),
        signal,
        onAbort,
      )

      signal.throwIfAborted()
      const textBoxes: TextBox[] = result.items
        .filter(({ text }) => text.trim())
        .map(({ poly, text }) => ({ text: text.trim(), bbox: toBoundingBox(poly) }))

      return textBoxes
    } finally {
      if (!aborted) this.activeRequests -= 1
    }
  }

  private async raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal, onAbort: () => void) {
    if (signal.aborted) {
      onAbort()
      void promise.catch(() => undefined)
      signal.throwIfAborted()
    }

    return await new Promise<T>((resolve, reject) => {
      const abort = () => {
        onAbort()
        reject(signal.reason)
      }

      signal.addEventListener('abort', abort, { once: true })
      const removeAbortListener = () => signal.removeEventListener('abort', abort)

      void promise.then(
        (result) => {
          removeAbortListener()
          resolve(result)
        },
        (error: unknown) => {
          removeAbortListener()
          reject(error)
        },
      )
    })
  }
}
