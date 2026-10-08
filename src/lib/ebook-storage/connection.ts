import { EbookStoreClient } from './storage-client'
import { isOpfsSupported } from './browser-storage'

export const ebookStore = isOpfsSupported() ? new EbookStoreClient() : null
