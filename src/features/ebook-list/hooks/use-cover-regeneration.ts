import { useState } from 'react'
import type { StoredBook } from '../ebook-types'
import { EbookStoreError } from '../lib/ebook-store-client'
import type { EbookLibraryStore } from '../lib/ebook-library-store'
import { analyzePdf } from '../lib/pdf-import'

interface UseCoverRegenerationOptions {
  store: EbookLibraryStore
  refreshBooks(): Promise<void>
  refreshUsage(): Promise<void>
}

export function useCoverRegeneration({
  store,
  refreshBooks,
  refreshUsage,
}: UseCoverRegenerationOptions) {
  const [coverErrors, setCoverErrors] = useState<Record<string, string>>({})
  const [regeneratingCover, setRegeneratingCover] = useState<string | null>(null)

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
      ) {
        throw new Error('Invalid PDF data')
      }
      const analyzed = await analyzePdf(new File([new Uint8Array(result.pdf_data)], book.file_name))
      if (!analyzed.coverData || !analyzed.coverMime) throw new Error('Cover rendering failed')
      await store.request('updateCover', {
        id: book.id,
        coverData: analyzed.coverData,
        coverMime: analyzed.coverMime,
      })
      await refreshBooks()
      await refreshUsage()
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

  return { coverErrors, regenerateCover, regeneratingCover }
}
