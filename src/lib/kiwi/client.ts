interface KiwiResponse {
  id: number
  ok: boolean
  text?: string
  error?: string
}

let worker: Worker | undefined
let sequence = 0
const pendingRequests = new Map<
  number,
  {
    resolve: (text: string) => void
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

export function postprocessWithKiwi(text: string, signal: AbortSignal) {
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
      if (data.ok) {
        request.resolve(data.text ?? '')
      } else {
        request.reject(new Error(data.error ?? 'Kiwi 후처리에 실패했습니다.'))
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
  return new Promise<string>((resolve, reject) => {
    const abort = () => stopWorker(getAbortError(signal))
    signal.addEventListener('abort', abort, { once: true })
    pendingRequests.set(id, {
      resolve,
      reject,
      removeAbortListener: () => signal.removeEventListener('abort', abort),
    })
    activeWorker.postMessage({ id, text })
  })
}
