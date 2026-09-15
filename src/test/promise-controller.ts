export interface PromiseController<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
}

export function createPromiseController<T>(): PromiseController<T> {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined
  let rejectPromise: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve(value) {
      if (!resolvePromise) {
        throw new Error('Promise resolver is not ready')
      }
      resolvePromise(value)
    },
    reject(reason) {
      if (!rejectPromise) {
        throw new Error('Promise rejecter is not ready')
      }
      rejectPromise(reason)
    },
  }
}
