import { EBOOK_STORE_ERROR_MESSAGES } from '../ebook-consts'
import {
  type AddBookInput,
  type EbookStoreCommand,
  type EbookStoreErrorCode,
  type EbookStoreRequest,
} from '../ebook-types'
import { isEbookStoreErrorCode } from '../ebook-utils'

interface EbookWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: EbookStoreRequest, transfer?: Transferable[]): void
  terminate(): void
}

interface PendingRequest {
  resolve(value: unknown): void
  reject(reason: unknown): void
}

export class EbookStoreError extends Error {
  readonly code: EbookStoreErrorCode

  constructor(code: EbookStoreErrorCode, cause?: unknown) {
    super(EBOOK_STORE_ERROR_MESSAGES[code], { cause })
    this.name = 'EbookStoreError'
    this.code = code
  }
}

export class EbookStoreClient {
  private readonly worker: EbookWorker
  private readonly pending = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private closed = false

  constructor(worker: EbookWorker) {
    this.worker = worker
    worker.onmessage = (event) => this.handleMessage(event.data)
    worker.onerror = (event) => this.close(event)
  }

  request(command: Exclude<EbookStoreCommand, 'addBook'>, payload?: unknown): Promise<unknown> {
    return this.sendWithRetry(command, payload, 1)
  }

  addBook(input: AddBookInput): Promise<unknown> {
    // 전송 후 분리된 원본 버퍼는 재전송할 수 없다. 삽입 재시도는 Worker가 처리한다.
    return this.send('addBook', input, [input.pdfData])
  }

  close(cause?: unknown): void {
    if (this.closed) return
    this.closed = true
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
    for (const pending of this.pending.values()) {
      pending.reject(new EbookStoreError('storage-failed', cause))
    }
    this.pending.clear()
  }

  private async sendWithRetry(
    command: EbookStoreCommand,
    payload: unknown,
    attempt: number,
  ): Promise<unknown> {
    try {
      return await this.send(command, payload)
    } catch (error) {
      if (error instanceof EbookStoreError && error.code === 'locked' && attempt < 3) {
        return this.sendWithRetry(command, payload, attempt + 1)
      }
      throw error
    }
  }

  private async send(
    command: EbookStoreCommand,
    payload: unknown,
    transfer: Transferable[] = [],
  ): Promise<unknown> {
    if (this.closed) throw new EbookStoreError('storage-failed')
    const requestId = this.nextRequestId++

    return await new Promise<unknown>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      const message: EbookStoreRequest = { requestId, command }
      if (payload !== undefined) message.payload = payload

      try {
        this.worker.postMessage(message, transfer)
      } catch (error) {
        this.pending.delete(requestId)
        reject(new EbookStoreError('storage-failed', error))
      }
    })
  }

  private handleMessage(data: unknown): void {
    if (
      typeof data !== 'object' ||
      data === null ||
      !('requestId' in data) ||
      typeof data.requestId !== 'number'
    ) {
      return
    }

    const pending = this.pending.get(data.requestId)
    if (!pending) return
    this.pending.delete(data.requestId)

    if ('error' in data) {
      const code =
        typeof data.error === 'object' &&
        data.error !== null &&
        'code' in data.error &&
        data.error.code
      pending.reject(new EbookStoreError(isEbookStoreErrorCode(code) ? code : 'storage-failed'))
    } else if ('result' in data) {
      pending.resolve(data.result)
    } else {
      pending.reject(new EbookStoreError('storage-failed'))
    }
  }
}
