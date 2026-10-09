import type { EbookStore } from '@/lib/ebook-storage/ebook-store'
import type { StoredBookDetail } from '@/lib/ebook-storage/data/book'
import { EbookStoreError } from '@/lib/ebook-storage/errors'
import { useEffect, useRef, useState } from 'react'
import type { BookAnalysisStatus, BookMetadata } from '@/lib/ebook-storage/data/book'

export type EbookReaderStore = Pick<
  EbookStore,
  'getBook' | 'getStoredOcrPage' | 'updateProgress' | 'searchChunks'
>

interface ReaderBook {
  analysisStatus: BookAnalysisStatus
  lastPage: number | null
  metadata: BookMetadata
  pdfData: Uint8Array
}

type EbookReaderState =
  | { status: 'loading' }
  | { status: 'ready'; book: ReaderBook }
  | { status: 'error'; message: string }

function toReaderBook(book: StoredBookDetail): ReaderBook {
  return {
    analysisStatus: book.analysis_status,
    lastPage: book.last_page,
    metadata: {
      title: book.title,
      author: book.author ?? undefined,
      subject: book.pdf_subject ?? undefined,
      keywords: book.pdf_keywords ?? undefined,
      publisher: book.publisher ?? undefined,
    },
    pdfData: book.pdf_data,
  }
}

export function useEbookReadingSession(bookId: string, store: EbookReaderStore) {
  const [state, setState] = useState<EbookReaderState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const pendingPageRef = useRef<number | null>(null)
  const isSavingRef = useRef(false)

  async function flushProgress() {
    if (isSavingRef.current || pendingPageRef.current === null) return
    const page = pendingPageRef.current
    pendingPageRef.current = null
    isSavingRef.current = true
    let saved = false

    try {
      await store.updateProgress({ id: bookId, page })
      saved = true
    } catch {
      pendingPageRef.current ??= page
    } finally {
      isSavingRef.current = false
      if (saved && pendingPageRef.current !== null) void flushProgress()
    }
  }

  function saveReadingPosition(page: number) {
    pendingPageRef.current = page
    void flushProgress()
  }

  useEffect(() => {
    let active = true

    async function loadBook() {
      try {
        const result = await store.getBook(bookId)
        if (!active) return
        const book = toReaderBook(result)
        setState({ status: 'ready', book })
      } catch (error) {
        if (active)
          setState({
            status: 'error',
            message:
              error instanceof EbookStoreError && error.code === 'notfound'
                ? '책을 찾을 수 없습니다.'
                : '저장된 PDF 원본을 읽지 못했습니다.',
          })
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

  return { retry, saveReadingPosition, state }
}
