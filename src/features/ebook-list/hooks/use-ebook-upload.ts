import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { EbookStoreError } from '../lib/ebook-store-client'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { analyzePdf, PdfImportError } from '../lib/pdf-import'

interface UseEbookUploadOptions {
  store: EbookLibraryStore
  isLibraryReady: boolean
  refreshBooks(): Promise<void>
  refreshUsage(): Promise<void>
  startOcrAnalysis(bookId: string): Promise<void>
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
  refreshUsage,
  startOcrAnalysis,
}: UseEbookUploadOptions) {
  const [isUploading, setIsUploading] = useState(false)

  async function addFiles(files: File[]) {
    if (isUploading || !isLibraryReady) return

    setIsUploading(true)
    try {
      for (const file of files) {
        try {
          // 1. PDF 메타데이터 추출
          const analyzed = await analyzePdf(file)

          // 2. PDF 메타데이터 및 원본 저장
          const bookId = await store.saveBook(analyzed)
          toast.add({ title: `${file.name}을 추가했습니다.`, type: 'success' })

          // 3. OCR 분석 파이프라인 실행
          if (typeof bookId === 'string') {
            void startOcrAnalysis(bookId)
              .finally(() => refreshBooks())
              .catch(() => undefined)
          }
        } catch (error) {
          toast.add({
            title: `${file.name}을 추가하지 못했습니다.`,
            description: failureMessage(error),
            type: 'error',
          })
        } finally {
          try {
            await refreshUsage()
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
