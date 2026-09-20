import { Alert, AlertTitle } from '@/components/ui/alert'
import { OcrConsole } from '@/features/ebook-list/components/ocr-console'
import type { EbookLibraryStore } from '@/features/ebook-list/lib/ebook-library-store'

export function OcrConsolePage({ store }: { store: EbookLibraryStore | null }) {
  if (!store) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>이 브라우저에서는 로컬 책장을 사용할 수 없습니다.</AlertTitle>
        </Alert>
      </main>
    )
  }

  return <OcrConsole store={store} />
}
