import { EbookStoreClient } from './ebook-store-client'
import { isOpfsSupported } from './storage-manager'

export const ebookStore = isOpfsSupported()
  ? new EbookStoreClient(
      new Worker(new URL('./ebook-db.worker.ts', import.meta.url), { type: 'module' }),
    )
  : null
