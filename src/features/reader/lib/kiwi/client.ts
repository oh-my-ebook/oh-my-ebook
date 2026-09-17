interface KiwiResponse {
  id: number
  ok: boolean
  text?: string
  error?: string
}

let worker: Worker | undefined
let sequence = 0
const pending = new Map<
  number,
  { resolve: (text: string) => void; reject: (error: Error) => void }
>()

export function postprocessWithKiwi(text: string) {
  if (!worker) {
    worker = new Worker(new URL('../../workers/kiwi.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = ({ data }: MessageEvent<KiwiResponse>) => {
      const request = pending.get(data.id)
      if (!request) {
        return
      }
      pending.delete(data.id)
      if (data.ok) {
        request.resolve(data.text ?? '')
      } else {
        request.reject(new Error(data.error ?? 'Kiwi 후처리에 실패했습니다.'))
      }
    }
    worker.onerror = () => {
      const error = new Error('Kiwi Worker를 실행하지 못했습니다.')
      pending.forEach(({ reject }) => reject(error))
      pending.clear()
      worker?.terminate()
      worker = undefined
    }
  }

  const id = ++sequence
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker?.postMessage({ id, text })
  })
}
