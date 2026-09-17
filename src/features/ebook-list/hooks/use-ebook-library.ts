import { useEffect, useRef, useState } from 'react'
import type { AddBookInput, StoredBook } from '../ebook-types'
import { EbookStoreError } from '../lib/ebook-store-client'
import { toast } from '@/components/ui/toast'
import { analyzePdf, PdfImportError } from '../lib/pdf-import'
import {
  getStorageCapacity,
  getPersistentStorageStatus,
  requestPersistentStorage,
  type StorageCapacity,
} from '../lib/storage-manager'

export interface EbookLibraryStore {
  request(
    command:
      | 'initialize'
      | 'listBooks'
      | 'hasBook'
      | 'getBook'
      | 'updateCover'
      | 'updateTitle'
      | 'deleteBook',
    payload?: unknown,
  ): Promise<unknown>
  addBook(input: AddBookInput): Promise<unknown>
}

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

function failureMessage(error: unknown) {
  if (error instanceof EbookStoreError && error.code === 'storage-failed') {
    return 'PDF 저장에 실패했습니다. 다시 시도해 주세요.'
  }
  if (error instanceof PdfImportError || error instanceof EbookStoreError) return error.message
  return 'PDF 저장에 실패했습니다. 다시 시도해 주세요.'
}

export function useEbookLibrary(store: EbookLibraryStore) {
  const [state, setState] = useState<LibraryState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [capacity, setCapacity] = useState<StorageCapacity | null>(null)
  const [busy, setBusy] = useState(false)
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [coverErrors, setCoverErrors] = useState<Record<string, string>>({})
  const [regeneratingCover, setRegeneratingCover] = useState<string | null>(null)
  const busyRef = useRef(false)

  async function refreshCapacity() {
    setCapacity(await getStorageCapacity())
  }

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
      const [result, nextCapacity] = await Promise.all([
        store.request('listBooks'),
        getStorageCapacity(),
      ])
      if (!Array.isArray(result) || !result.every(isStoredBook))
        throw new Error('Invalid book list')
      setState({ status: 'ready', books: result })
      setCapacity(nextCapacity)
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
        const [nextCapacity, isPersistent] = await Promise.all([
          getStorageCapacity(),
          getPersistentStorageStatus(),
        ])
        if (active) {
          setState({ status: 'ready', books: result })
          setCapacity(nextCapacity)
          setPersistentStorage(isPersistent)
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
  }, [store, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((current) => current + 1)
  }

  async function addFiles(files: File[]) {
    if (busyRef.current || state.status !== 'ready') return
    busyRef.current = true
    setBusy(true)
    try {
      for (const file of files) {
        try {
          const currentCapacity = await getStorageCapacity()
          if (currentCapacity && file.size > currentCapacity.remaining) {
            throw new EbookStoreError('quota')
          }
          const analyzed = await analyzePdf(file)
          await store.addBook(analyzed)
          toast.add({ title: `${file.name}을 추가했습니다.`, type: 'success' })
        } catch (error) {
          const message = failureMessage(error)
          toast.add({
            title: `${file.name}을 추가하지 못했습니다.`,
            description: message,
            type: 'error',
          })
        } finally {
          await refreshCapacity()
          try {
            await refreshBooks()
          } catch {
            /* 다음 파일은 계속 처리한다. */
          }
        }
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function regenerateCover(book: StoredBook) {
    setRegeneratingCover(book.id)
    setCoverErrors((current) => ({ ...current, [book.id]: '' }))
    try {
      const result = await store.request('getBook', book.id)
      if (
        typeof result !== 'object' ||
        result === null ||
        !('pdf_data' in result) ||
        !(result.pdf_data instanceof Uint8Array)
      )
        throw new Error('Invalid PDF data')
      const analyzed = await analyzePdf(new File([new Uint8Array(result.pdf_data)], book.file_name))
      if (!analyzed.coverData || !analyzed.coverMime) throw new Error('Cover rendering failed')
      await store.request('updateCover', {
        id: book.id,
        coverData: analyzed.coverData,
        coverMime: analyzed.coverMime,
      })
      await refreshBooks()
      await refreshCapacity()
    } catch (error) {
      setCoverErrors((current) => ({
        ...current,
        [book.id]:
          error instanceof EbookStoreError ? error.message : '표지를 다시 만들지 못했습니다.',
      }))
    } finally {
      setRegeneratingCover(null)
    }
  }

  async function renameBook(bookId: string, title: string) {
    try {
      await store.request('updateTitle', { id: bookId, title })
      await Promise.all([refreshBooks(), refreshCapacity()])
    } catch {
      toast.add({ title: '책 제목을 수정하지 못했습니다.', type: 'error' })
    }
  }

  async function deleteBook(bookId: string) {
    try {
      await store.request('deleteBook', bookId)
      await Promise.all([refreshBooks(), refreshCapacity()])
    } catch {
      toast.add({ title: '책을 삭제하지 못했습니다.', type: 'error' })
    }
  }

  async function requestPersistence(): Promise<boolean> {
    const isPersistent = await requestPersistentStorage()
    setPersistentStorage(isPersistent)
    return isPersistent
  }

  return {
    state,
    retry,
    refreshLibrary,
    refreshError,
    refreshing,
    capacity,
    refreshCapacity,
    busy,
    persistentStorage,
    requestPersistence,
    addFiles,
    regenerateCover,
    coverErrors,
    regeneratingCover,
    renameBook,
    deleteBook,
  }
}
