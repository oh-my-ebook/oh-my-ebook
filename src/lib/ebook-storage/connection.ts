import type { EbookStore } from '@shared/lib/ebook-storage/ebook-store'
import { EbookStoreClient } from './storage-client'
import { isOpfsSupported } from './browser-storage'

export const ebookStore: EbookStore | null = isOpfsSupported() ? new EbookStoreClient() : null
