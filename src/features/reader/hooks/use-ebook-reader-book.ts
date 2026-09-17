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
  const pendingPageRef = useRef<number | null>(null)
  const savingRef = useRef(false)

  async function flushProgress() {
    if (savingRef.current || pendingPageRef.current === null) return
    const page = pendingPageRef.current
    pendingPageRef.current = null
    savingRef.current = true

    try {
      await store.request('updateProgress', { id: bookId, page })
    } catch {
      // 저장 실패는 현재 Reader를 닫거나 페이지 이동을 되돌리지 않는다.
    } finally {
      savingRef.current = false
      if (pendingPageRef.current !== null) void flushProgress()
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
  }, [bookId, store])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') void flushProgress()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { saveProgress, state }
}
