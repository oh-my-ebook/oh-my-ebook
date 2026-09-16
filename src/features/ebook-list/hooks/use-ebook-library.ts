import { useEffect, useState } from 'react'
import { EbookStoreError } from '../lib/ebook-store-client'

export interface EbookLibraryStore {
  request(command: 'initialize' | 'listBooks'): Promise<unknown>
}

type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; books: unknown[] }
  | { status: 'error'; message: string }

export function useEbookLibrary(store: EbookLibraryStore) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        await store.request('initialize')
        const result = await store.request('listBooks')
        if (!Array.isArray(result)) throw new Error('Invalid book list')
        if (active) setState({ status: 'ready', books: result })
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof EbookStoreError
                ? error.message
                : '로컬 저장소에 접근하지 못했습니다.',
          })
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [store, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  return { state, retry }
}
