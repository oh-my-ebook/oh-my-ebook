import { type KiwiRequestType, KIWI_REQUEST } from './kiwi.const'
import type { KiwiSearchTerm, KiwiWorkerRequest, KiwiWorkerResponse } from './kiwi.types'

interface PendingRequest {
  type: KiwiRequestType
  resolve(result: unknown): void
  reject(error: unknown): void
  detachAbortListener(): void
}

export class KiwiClient {
  private worker: Worker | undefined
  private lastRequestId = 0
  private readonly pendingRequests = new Map<number, PendingRequest>()

  normalizeText(text: string, signal: AbortSignal): Promise<string> {
    return this.sendRequest(KIWI_REQUEST.NORMALIZE_TEXT, text, signal)
  }

  extractSearchTerms(text: string, signal: AbortSignal): Promise<KiwiSearchTerm[]> {
    return this.sendRequest(KIWI_REQUEST.EXTRACT_SEARCH_TERMS, text, signal)
  }

  private async sendRequest<Result>(
    type: KiwiRequestType,
    text: string,
    signal: AbortSignal,
  ): Promise<Result> {
    if (signal.aborted) throw this.getAbortError(signal)

    const worker = this.getWorker()
    const requestId = ++this.lastRequestId
    const message: KiwiWorkerRequest = { id: requestId, type, text }

    return new Promise<Result>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        type,
        resolve,
        reject,
        detachAbortListener: this.addAbortListener(requestId, signal),
      })

      try {
        worker.postMessage(message)
      } catch (error) {
        this.takePendingRequest(requestId)
        reject(error)
      }
    })
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(new URL('./kiwi.worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = ({ data }: MessageEvent<KiwiWorkerResponse>) => this.handleResponse(data)
    worker.onerror = () => {
      this.stopWorker(new Error('현재 Kiwi worker에서 오류가 발생했습니다.'))
    }

    this.worker = worker
    return worker
  }

  private handleResponse(response: KiwiWorkerResponse): void {
    const request = this.takePendingRequest(response.id)
    if (!request) return

    if (response.ok === false) {
      request.reject(new Error(response.error))
      return
    }

    if (response.type !== request.type) {
      request.reject(new Error('Kiwi Worker 응답 타입이 요청과 다릅니다.'))
      return
    }

    switch (response.type) {
      case KIWI_REQUEST.NORMALIZE_TEXT:
        request.resolve(response.text)
        break
      case KIWI_REQUEST.EXTRACT_SEARCH_TERMS:
        request.resolve(response.terms)
        break
    }
  }

  private addAbortListener(requestId: number, signal: AbortSignal): () => void {
    const onAbort = () => {
      this.takePendingRequest(requestId)?.reject(this.getAbortError(signal))
    }

    signal.addEventListener('abort', onAbort, { once: true })

    return () => signal.removeEventListener('abort', onAbort)
  }

  private takePendingRequest(requestId: number): PendingRequest | undefined {
    const request = this.pendingRequests.get(requestId)
    if (!request) return

    this.pendingRequests.delete(requestId)
    request.detachAbortListener()
    return request
  }

  private stopWorker(error: Error): void {
    this.terminateWorker()
    this.rejectPendingRequests(error)
  }

  private terminateWorker(): void {
    if (!this.worker) return

    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
    this.worker = undefined
  }

  private rejectPendingRequests(error: Error): void {
    this.pendingRequests.forEach((request) => {
      request.detachAbortListener()
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
