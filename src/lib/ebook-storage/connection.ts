import type { EbookStore } from './ebook-store'
import { EbookStoreClient } from './storage-client'
import { isOpfsSupported } from './browser-storage'

export const ebookStore: EbookStore | null = isOpfsSupported() ? new EbookStoreClient() : null
