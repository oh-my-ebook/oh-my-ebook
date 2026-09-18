import { useState } from 'react'
import type { UploadItem } from '../components/pdf-upload'
import { EbookStoreError } from '../lib/ebook-store-client'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { analyzePdf, PdfImportError } from '../lib/pdf-import'
import { getStorageCapacity } from '../lib/storage-manager'

interface UseEbookUploadOptions {
  store: EbookLibraryStore
  isLibraryReady: boolean
  refreshBooks(): Promise<void>
  refreshCapacity(): Promise<void>
}

function failureMessage(error: unknown) {
  if (error instanceof EbookStoreError && error.code === 'storage-failed') {
    return 'PDF 저장에 실패했습니다. 다시 시도해 주세요.'
  }
  if (error instanceof PdfImportError || error instanceof EbookStoreError) return error.message
  return 'PDF 저장에 실패했습니다. 다시 시도해 주세요.'
}

export function useEbookUpload({
  store,
  isLibraryReady,
  refreshBooks,
  refreshCapacity,
}: UseEbookUploadOptions) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)

  function updateItem(id: string, status: UploadItem['status'], message?: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status, message } : item)),
    )
  }

  async function addFiles(files: File[]) {
    if (isUploading || !isLibraryReady) return

    setIsUploading(true)
    const queued = files.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'pending' as const,
    }))
    setItems(queued)

    try {
      for (const [index, file] of files.entries()) {
        const id = queued[index].id
        updateItem(id, 'processing')
        try {
          const currentCapacity = await getStorageCapacity()
          if (currentCapacity && file.size > currentCapacity.remaining) {
            throw new EbookStoreError('quota')
          }
          const analyzed = await analyzePdf(file)
          await store.addBook(analyzed)
          updateItem(id, 'success')
        } catch (error) {
          updateItem(id, 'error', failureMessage(error))
        } finally {
          await refreshCapacity()
          try {
            await refreshBooks()
          } catch {
            /* 다음 파일은 계속 처리한다. */
          }
        }
      }
    } catch (error) {
      setItems((current) =>
        current.map((item) =>
          item.status === 'pending' || item.status === 'processing'
            ? { ...item, status: 'error', message: failureMessage(error) }
            : item,
        ),
      )
    } finally {
      setIsUploading(false)
    }
  }

  return { addFiles, isUploading, items }
}
