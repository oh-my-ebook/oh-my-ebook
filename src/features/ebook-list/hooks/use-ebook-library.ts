import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import type { StoredBook } from '../ebook-types'
import { EbookStoreError } from '../lib/ebook-store-client'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { createOcrAnalysisCoordinator } from '../lib/ebook-analysis/ocr-analysis-coordinator'
import type { OcrAnalysisFailure, OcrAnalysisResult } from '../lib/ebook-analysis/ocr-analysis'
import { useCoverRegeneration } from './use-cover-regeneration'
import { useEbookUpload } from './use-ebook-upload'
import { useLibraryStorage } from './use-library-storage'

export type { EbookLibraryStore } from '../lib/ebook-library-store'

type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; books: StoredBook[] }
  | { status: 'error'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPdfStatus(value: unknown): value is StoredBook['pdf_status'] {
  return value === 'available' || value === 'missing'
}

function isAnalysisStatus(value: unknown): value is StoredBook['analysis_status'] {
  return value === 'analyzing' || value === 'ready' || value === 'failed'
}

function isNullableTimestamp(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value))
}

function isStoredBook(value: unknown): value is StoredBook {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isPdfStatus(value.pdf_status) &&
    isAnalysisStatus(value.analysis_status) &&
    isNullableTimestamp(value.ocr_completed_at) &&
    isNullableTimestamp(value.indexed_at)
  )
}

export function useEbookLibrary(store: EbookLibraryStore) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const storage = useLibraryStorage()
  const { refreshUsage } = storage
  const ocrCoordinatorRef = useRef<ReturnType<typeof createOcrAnalysisCoordinator> | null>(null)
  if (ocrCoordinatorRef.current === null) {
    ocrCoordinatorRef.current = createOcrAnalysisCoordinator()
  }
  const ocrCoordinator = ocrCoordinatorRef.current

  function reportOcrFailure(failure: OcrAnalysisFailure) {
    const page = failure.pageNumber === undefined ? '' : ` ${failure.pageNumber}페이지`
    const message =
      failure.error instanceof Error && failure.error.message
        ? failure.error.message
        : '알 수 없는 오류가 발생했습니다.'
    console.error(`OCR 분석 실패 (${failure.stage}${page})`, failure.error)
    toast.add({
      title:
        failure.pageNumber === undefined
          ? '책 분석에 실패했습니다.'
          : `${failure.pageNumber}페이지 OCR에 실패했습니다.`,
      description: message,
      type: 'error',
    })
  }

  const startOcrAnalysis = useCallback(
    async (bookId: string): Promise<OcrAnalysisResult | undefined> => {
      return await ocrCoordinator.startOcrAnalysis(bookId, store, reportOcrFailure)
    },
    [ocrCoordinator, store],
  )

  async function refreshBooks() {
    const result = await store.request('listBooks')
    if (!Array.isArray(result) || !result.every(isStoredBook)) throw new Error('Invalid book list')
    setState({ status: 'ready', books: result })
  }

  async function refreshLibrary() {
    if (refreshing || state.status !== 'ready') return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const [result] = await Promise.all([store.request('listBooks'), refreshUsage()])
      if (!Array.isArray(result) || !result.every(isStoredBook))
        throw new Error('Invalid book list')
      setState({ status: 'ready', books: result })
    } catch {
      setRefreshError('책장을 새로고침하지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        await store.request('initialize')
        const result = await store.request('listBooks')
        if (!Array.isArray(result) || !result.every(isStoredBook))
          throw new Error('Invalid book list')
        await refreshUsage()
        if (active) {
          setState({ status: 'ready', books: result })
        }
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
  }, [store, attempt, refreshUsage])

  // 분석 중 브라우저가 종료되고 다시 들어왔을 때,
  // 분석이 완료되지 않은 책에 대해 OCR 분석을 재개한다.
  useEffect(() => {
    if (state.status !== 'ready') return
    const pendingBooks = state.books.filter((book) => book.analysis_status === 'analyzing')

    async function resumeOcrAnalysis() {
      for (const book of pendingBooks) {
        const result = await startOcrAnalysis(book.id)
        if (result !== 'failed') continue
        setState((current) => {
          if (current.status !== 'ready') return current
          return {
            status: 'ready',
            books: current.books.map((currentBook) =>
              currentBook.id === book.id
                ? { ...currentBook, analysis_status: 'failed' }
                : currentBook,
            ),
          }
        })
      }
    }

    void resumeOcrAnalysis().catch(() => undefined)
  }, [state, startOcrAnalysis])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  const upload = useEbookUpload({
    store,
    isLibraryReady: state.status === 'ready',
    refreshBooks,
    refreshUsage,
    startOcrAnalysis: async (bookId) => {
      await startOcrAnalysis(bookId)
    },
  })
  const coverRegeneration = useCoverRegeneration({
    store,
    refreshBooks,
    refreshUsage,
  })

  async function renameBook(bookId: string, title: string) {
    try {
      await store.request('updateTitle', { id: bookId, title })
    } catch {
      toast.add({ title: '책 제목을 수정하지 못했습니다.', type: 'error' })
      return
    }
    void refreshLibrary()
  }

  async function deleteBook(bookId: string) {
    await store.request('deleteBook', bookId)
    void refreshLibrary()
  }

  async function retryOcrAnalysis(bookId: string) {
    try {
      await store.request('retryBookAnalysis', bookId)
      await startOcrAnalysis(bookId)
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : '다시 시도하지 못했습니다.'
      console.error('OCR 분석 재시도 실패', error)
      toast.add({
        title: '책 분석을 다시 시작하지 못했습니다.',
        description: message,
        type: 'error',
      })
    } finally {
      await refreshBooks().catch(() => undefined)
    }
  }

  return {
    state,
    retry,
    refreshLibrary,
    refreshError,
    refreshing,
    usage: storage.usage,
    isUploading: upload.isUploading,
    addFiles: upload.addFiles,
    regenerateCover: coverRegeneration.regenerateCover,
    coverErrors: coverRegeneration.coverErrors,
    regeneratingCover: coverRegeneration.regeneratingCover,
    renameBook,
    deleteBook,
    retryOcrAnalysis,
  }
}
