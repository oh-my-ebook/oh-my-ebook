import { useState } from 'react'
import { toast } from '@/components/ui/toast'
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
  const [isUploading, setIsUploading] = useState(false)

  async function addFiles(files: File[]) {
    if (isUploading || !isLibraryReady) return

    setIsUploading(true)
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
          toast.add({
            title: `${file.name}을 추가하지 못했습니다.`,
            description: failureMessage(error),
            type: 'error',
          })
        } finally {
          try {
            await refreshCapacity()
            await refreshBooks()
          } catch {
            /* 다음 파일은 계속 처리한다. */
          }
        }
      }
    } finally {
      setIsUploading(false)
    }
  }

  return { addFiles, isUploading }
}
