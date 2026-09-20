import { useEffect, useRef, useState } from 'react'
import type { BookAnalysisStatus } from '@/features/ebook-list/ebook-types'
import type { BookMetadata } from '../lib/book-metadata'

export interface EbookReaderStore {
  request(
    command: 'getBook' | 'getStoredOcrPage' | 'updateProgress' | 'searchChunks',
    payload?: unknown,
  ): Promise<unknown>
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalMetadataValue(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function isBookAnalysisStatus(value: unknown): value is BookAnalysisStatus {
  return value === 'analyzing' || value === 'ready' || value === 'failed'
}

function parseReaderBook(value: unknown): ReaderBook | null {
  if (!isRecord(value)) return null

  const fileName = value.file_name
  const lastPage = value.last_page
  const pdfData = value.pdf_data
  const hasTitle = 'title' in value
  const title = value.title
  const author = value.author
  const subject = value.pdf_subject
  const keywords = value.pdf_keywords
  const publisher = value.publisher
  const analysisStatus = value.analysis_status

  if (typeof fileName !== 'string') return null
  if (lastPage !== null && (typeof lastPage !== 'number' || !Number.isSafeInteger(lastPage))) {
    return null
  }
  if (!(pdfData instanceof Uint8Array)) return null
  if (hasTitle && typeof title !== 'string') return null
  if (!isOptionalMetadataValue(author)) return null
  if (!isOptionalMetadataValue(subject)) return null
  if (!isOptionalMetadataValue(keywords)) return null
  if (!isOptionalMetadataValue(publisher)) return null
  if (!isBookAnalysisStatus(analysisStatus)) return null

  return {
    analysisStatus,
    lastPage,
    metadata: {
      title: typeof title === 'string' ? title : fileName,
      author: author ?? undefined,
      subject: subject ?? undefined,
      keywords: keywords ?? undefined,
      publisher: publisher ?? undefined,
    },
    pdfData,
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
      await store.request('updateProgress', { id: bookId, page })
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
