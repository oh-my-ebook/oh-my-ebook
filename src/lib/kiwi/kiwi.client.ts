import { type KiwiRequestType, KIWI_REQUEST } from './const'
import type {
  KiwiSearchTerm,
  KiwiWorkerRequest,
  KiwiWorkerResponse,
  PendingRequest,
} from './kiwi.types'

export class KiwiClient {
  private worker: Worker | undefined
  private sequence = 0
  private readonly pendingRequests = new Map<number, PendingRequest>()

  normalizeText(text: string, signal: AbortSignal): Promise<string> {
    return this.request(KIWI_REQUEST.NORMALIZE_TEXT, text, signal)
  }

  extractSearchTerms(text: string, signal: AbortSignal): Promise<KiwiSearchTerm[]> {
    return this.request(KIWI_REQUEST.EXTRACT_SEARCH_TERMS, text, signal)
  }

  private async request<Result>(
    type: KiwiRequestType,
    text: string,
    signal: AbortSignal,
  ): Promise<Result> {
    if (signal.aborted) throw this.getAbortError(signal)

    const worker = this.getWorker()
    const id = ++this.sequence
    const message: KiwiWorkerRequest = { id, type, text }

    const pendingRequest = await new Promise<Result>((resolve, reject) => {
      const removeAbortListener = this.addAbortListener(id, signal)

      this.pendingRequests.set(id, {
        type,
        resolve,
        reject,
        removeAbortListener,
      })

      try {
        worker.postMessage(message)
      } catch (error) {
        this.pendingRequests.delete(id)
        removeAbortListener()
        reject(error)
      }
    })

    return pendingRequest
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('./kiwi.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = ({ data }: MessageEvent<KiwiWorkerResponse>) => this.handleMessage(data)
    worker.onerror = () => {
      this.stopWorker(new Error('현재 Kiwi worker에서 오류가 발생했습니다.'))
    }

    this.worker = worker
    return worker
  }

  private handleMessage(data: KiwiWorkerResponse): void {
    const request = this.pendingRequests.get(data.id)
    if (!request) return

    this.removeAbortListener(data.id)

    if (data.ok === false) {
      request.reject(new Error(data.error))
      return
    }

    if (data.type !== request.type) {
      request.reject(new Error('Kiwi Worker 응답 타입이 요청과 다릅니다.'))
      return
    }

    switch (data.type) {
      case KIWI_REQUEST.NORMALIZE_TEXT:
        request.resolve(data.text)
        break
      case KIWI_REQUEST.EXTRACT_SEARCH_TERMS:
        request.resolve(data.terms)
        break
    }
  }

  private addAbortListener(id: number, signal: AbortSignal): () => void {
    const abort = () => {
      const request = this.pendingRequests.get(id)
      if (!request) return

      this.removeAbortListener(id)

      request.reject(this.getAbortError(signal))
    }

    signal.addEventListener('abort', abort, { once: true })

    return () => signal.removeEventListener('abort', abort)
  }

  private removeAbortListener(id: number): void {
    const request = this.pendingRequests.get(id)
    if (!request) return

    this.pendingRequests.delete(id)
    request.removeAbortListener()
  }

  private stopWorker(error: Error): void {
    if (this.worker) this.clearWorker()

    // 모든 pending 요청을 취소하고 에러를 전달한다.
    this.clearPendingRequests(error)
  }

  private clearWorker(): void {
    if (!this.worker) return

    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
    this.worker = undefined
  }

  private clearPendingRequests(error: Error): void {
    this.pendingRequests.forEach((request) => {
      request.removeAbortListener()
      request.reject(error)
    })

    this.pendingRequests.clear()
  }

  private getAbortError(signal: AbortSignal): Error {
    return signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Kiwi 분석이 중단되었습니다.', 'AbortError')
  }
}

export const kiwiClient = new KiwiClient()
