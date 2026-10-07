import { EbookStoreClient } from './worker-client'
import { isOpfsSupported } from './browser-storage'

export const ebookStore = isOpfsSupported()
  ? new EbookStoreClient(
      new Worker(new URL('./worker/storage.worker.ts', import.meta.url), {
        type: 'module',
      }),
    )
  : null
