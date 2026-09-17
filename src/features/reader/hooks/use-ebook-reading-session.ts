import { useEffect, useRef, useState } from 'react'

export interface EbookReaderStore {
  request(command: 'getBook' | 'updateProgress', payload?: unknown): Promise<unknown>
}

interface ReaderDocument {
  lastPage: number | null
  pdfData: Uint8Array
  title: string
}

type EbookReaderState =
  | { status: 'loading' }
  | { status: 'ready'; book: ReaderDocument }
  | { status: 'error'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseReaderBook(value: unknown): ReaderDocument | null {
  if (!isRecord(value)) return null

  const fileName = value.file_name
  const lastPage = value.last_page
  const pdfData = value.pdf_data
  const hasTitle = 'title' in value
  const title = value.title

  if (typeof fileName !== 'string') return null
  if (lastPage !== null && (typeof lastPage !== 'number' || !Number.isSafeInteger(lastPage)))
    return null

  if (!(pdfData instanceof Uint8Array)) return null
  if (hasTitle && typeof title !== 'string') return null

  return {
    lastPage,
    pdfData,
    title: typeof title === 'string' ? title : fileName,
  }
}

export function useEbookReadingSession(bookId: string, store: EbookReaderStore) {
  const [state, setState] = useState<EbookReaderState>({ status: 'loading' })
  const pendingPageRef = useRef<number | null>(null)
  const isSavingRef = useRef(false)

  async function flushPendingPosition() {
    if (isSavingRef.current || pendingPageRef.current === null) return
    const page = pendingPageRef.current
    pendingPageRef.current = null
    isSavingRef.current = true

    try {
      await store.request('updateProgress', { id: bookId, page })
    } catch {
      // 저장 실패는 현재 Reader를 닫거나 페이지 이동을 되돌리지 않는다.
    } finally {
      isSavingRef.current = false
      if (pendingPageRef.current !== null) void flushPendingPosition()
    }
  }

  function saveReadingPosition(page: number) {
    pendingPageRef.current = page
    void flushPendingPosition()
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
        const book = parseReaderBook(result)
        if (book === null) {
          setState({ status: 'error', message: '저장된 PDF 원본을 읽지 못했습니다.' })
          return
        }
        setState({ status: 'ready', book })
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
      if (document.visibilityState === 'hidden') void flushPendingPosition()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return { saveReadingPosition, state }
}
