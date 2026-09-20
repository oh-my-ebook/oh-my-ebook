import type { KiwiSearchTerm } from './postprocess'

type KiwiRequestType = 'postprocess' | 'extract-search-terms'

interface KiwiResponse {
  id: number
  ok: boolean
  type: KiwiRequestType
  text?: string
  terms?: KiwiSearchTerm[]
  error?: string
}

let worker: Worker | undefined
let sequence = 0
const pendingRequests = new Map<
  number,
  {
    type: KiwiRequestType
    resolve: (result: string | KiwiSearchTerm[]) => void
    reject: (error: Error) => void
    removeAbortListener: () => void
  }
>()

function stopWorker(error: Error) {
  worker?.terminate()
  worker = undefined
  pendingRequests.forEach((request) => {
    request.removeAbortListener()
    request.reject(error)
  })
  pendingRequests.clear()
}

function getAbortError(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Kiwi 후처리가 중단되었습니다.', 'AbortError')
}

function isKiwiSearchTerms(value: unknown): value is KiwiSearchTerm[] {
  return (
    Array.isArray(value) &&
    value.every(
      (term) =>
        typeof term === 'object' &&
        term !== null &&
        'term' in term &&
        typeof term.term === 'string' &&
        'termFrequency' in term &&
        typeof term.termFrequency === 'number',
    )
  )
}

function requestKiwi(
  type: KiwiRequestType,
  text: string,
  signal: AbortSignal,
): Promise<string | KiwiSearchTerm[]> {
  if (signal.aborted) {
    return Promise.reject(getAbortError(signal))
  }

  if (!worker) {
    const createdWorker = new Worker(new URL('../../workers/kiwi.worker.ts', import.meta.url), {
      type: 'module',
    })
    createdWorker.onmessage = ({ data }: MessageEvent<KiwiResponse>) => {
      const request = pendingRequests.get(data.id)
      if (!request) {
        return
      }
      pendingRequests.delete(data.id)
      request.removeAbortListener()
      if (!data.ok) {
        request.reject(new Error(data.error ?? 'Kiwi 후처리에 실패했습니다.'))
      } else if (data.type !== request.type) {
        request.reject(new Error('Kiwi Worker 응답 타입이 요청과 다릅니다.'))
      } else if (data.type === 'postprocess' && typeof data.text === 'string') {
        request.resolve(data.text)
      } else if (data.type === 'extract-search-terms' && isKiwiSearchTerms(data.terms)) {
        request.resolve(data.terms)
      } else {
        request.reject(new Error('Kiwi Worker 응답이 올바르지 않습니다.'))
      }
    }
    createdWorker.onerror = () => {
      if (worker === createdWorker) {
        stopWorker(new Error('Kiwi Worker를 실행하지 못했습니다.'))
      }
    }
    worker = createdWorker
  }

  const id = ++sequence
  const activeWorker = worker
  return new Promise<string | KiwiSearchTerm[]>((resolve, reject) => {
    const abort = () => stopWorker(getAbortError(signal))
    signal.addEventListener('abort', abort, { once: true })
    pendingRequests.set(id, {
      type,
      resolve,
      reject,
      removeAbortListener: () => signal.removeEventListener('abort', abort),
    })
    activeWorker.postMessage({ id, type, text })
  })
}

export async function postprocessWithKiwi(text: string, signal: AbortSignal): Promise<string> {
  const result = await requestKiwi('postprocess', text, signal)
  if (typeof result !== 'string') throw new Error('Kiwi Worker 응답이 올바르지 않습니다.')
  return result
}

export async function extractSearchTermsWithKiwi(
  text: string,
  signal: AbortSignal,
): Promise<KiwiSearchTerm[]> {
  const result = await requestKiwi('extract-search-terms', text, signal)
  if (!isKiwiSearchTerms(result)) throw new Error('Kiwi Worker 응답이 올바르지 않습니다.')
  return result
}
