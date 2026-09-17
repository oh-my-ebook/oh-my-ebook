import { useEffect, useRef, useState } from 'react'

export interface EbookReaderStore {
  request(command: 'getBook' | 'updateProgress', payload?: unknown): Promise<unknown>
}

interface ReaderBook {
  lastPage: number | null
  pdfData: Uint8Array
  title: string
}

type EbookReaderBookState =
  | { status: 'loading' }
  | { status: 'ready'; book: ReaderBook }
  | { status: 'error'; message: string }

function isReaderBook(value: unknown): value is {
  file_name: string
  last_page: number | null
  pdf_data: Uint8Array
  title?: string
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file_name' in value &&
    typeof value.file_name === 'string' &&
    'last_page' in value &&
    (value.last_page === null || Number.isSafeInteger(value.last_page)) &&
    'pdf_data' in value &&
    value.pdf_data instanceof Uint8Array &&
    (!('title' in value) || typeof value.title === 'string')
  )
}

export function useEbookReaderBook(bookId: string, store: EbookReaderStore) {
  const [state, setState] = useState<EbookReaderBookState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const pendingPageRef = useRef<number | null>(null)
  const dbSavingRef = useRef(false)

  async function flushProgress() {
    if (dbSavingRef.current || pendingPageRef.current === null) return
    const page = pendingPageRef.current
    pendingPageRef.current = null
    dbSavingRef.current = true
    let saved = false

    try {
      await store.request('updateProgress', { id: bookId, page })
      saved = true
    } catch {
      pendingPageRef.current ??= page
    } finally {
      dbSavingRef.current = false
      if (saved && pendingPageRef.current !== null) void flushProgress()
    }
  }

  function saveProgress(page: number) {
    pendingPageRef.current = page
    void flushProgress()
  }

  useEffect(() => {
    let active = true

    async function loadBook() {
      try {
        const result = await store.request('getBook', bookId)
        if (!active) return
        if (result === null) {
          setState({ status: 'error', message: '책을 찾을 수 없습니다.' })
          return
        }
        if (!isReaderBook(result)) {
          setState({ status: 'error', message: '저장된 PDF 원본을 읽지 못했습니다.' })
          return
        }
        setState({
          status: 'ready',
          book: {
            lastPage: result.last_page,
            pdfData: result.pdf_data,
            title: result.title || result.file_name,
          },
        })
      } catch {
        if (active) setState({ status: 'error', message: '저장된 PDF 원본을 읽지 못했습니다.' })
      }
    }

    void loadBook()
    return () => {
      active = false
    }
  }, [attempt, bookId, store])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') void flushProgress()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  return { retry, saveProgress, state }
}
