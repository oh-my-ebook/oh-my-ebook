import { useEffect, useState } from 'react'
import { toast } from '@/components/ui/toast'
import type { StoredBook } from '../ebook-types'
import { EbookStoreError } from '../lib/ebook-store-client'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { useCoverRegeneration } from './use-cover-regeneration'
import { useEbookUpload } from './use-ebook-upload'
import { useLibraryStorage } from './use-library-storage'

export type { EbookLibraryStore } from '../lib/ebook-library-store'

type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; books: StoredBook[] }
  | { status: 'error'; message: string }

function isStoredBook(value: unknown): value is StoredBook {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string'
  )
}

export function useEbookLibrary(store: EbookLibraryStore) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const storage = useLibraryStorage()
  const { refreshStorageStatus } = storage

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
      const [result] = await Promise.all([store.request('listBooks'), storage.refreshCapacity()])
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
        await refreshStorageStatus()
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
  }, [store, attempt, refreshStorageStatus])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  const upload = useEbookUpload({
    store,
    isLibraryReady: state.status === 'ready',
    refreshBooks,
    refreshCapacity: storage.refreshCapacity,
  })
  const coverRegeneration = useCoverRegeneration({
    store,
    refreshBooks,
    refreshCapacity: storage.refreshCapacity,
  })

  async function renameBook(bookId: string, title: string) {
    try {
      await store.request('updateTitle', { id: bookId, title })
      await Promise.all([refreshBooks(), storage.refreshCapacity()])
    } catch {
      toast.add({ title: '책 제목을 수정하지 못했습니다.', type: 'error' })
    }
  }

  async function deleteBook(bookId: string) {
    await store.request('deleteBook', bookId)
    await Promise.all([refreshBooks(), storage.refreshCapacity()])
  }

  return {
    state,
    retry,
    refreshLibrary,
    refreshError,
    refreshing,
    capacity: storage.capacity,
    refreshCapacity: storage.refreshCapacity,
    isUploading: upload.isUploading,
    persistentStorage: storage.persistentStorage,
    requestPersistence: storage.requestPersistence,
    addFiles: upload.addFiles,
    regenerateCover: coverRegeneration.regenerateCover,
    coverErrors: coverRegeneration.coverErrors,
    regeneratingCover: coverRegeneration.regeneratingCover,
    renameBook,
    deleteBook,
  }
}
