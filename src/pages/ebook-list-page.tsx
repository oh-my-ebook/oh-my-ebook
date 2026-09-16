import { Alert, AlertTitle } from '@/components/ui/alert'
import { EbookLibrary } from '@/features/ebook-list/components/ebook-library'
import { EbookStoreClient } from '@/features/ebook-list/lib/ebook-store-client'
import { isOpfsSupported } from '@/features/ebook-list/lib/storage-manager'

const client = isOpfsSupported()
  ? new EbookStoreClient(
      new Worker(new URL('../features/ebook-list/lib/ebook-db.worker.ts', import.meta.url), {
        type: 'module',
      }),
    )
  : null

export function EbookListPage() {
  if (!client) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Alert variant="destructive">
          <AlertTitle>이 브라우저에서는 로컬 책장을 사용할 수 없습니다.</AlertTitle>
        </Alert>
      </main>
    )
  }

  return <EbookLibrary store={client} />
}
