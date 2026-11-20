import { createChatModelAdapter } from './chat-adapter'
import { searchBookChunks, type SearchChunks } from './rag/search-book-chunks'
import { webLlmChatModel } from '@/app-services'

export function createBookSearchWebLlmChatModelAdapter(bookId: string, searchChunks: SearchChunks) {
  return createChatModelAdapter(webLlmChatModel, (messages, signal) =>
    searchBookChunks({ bookId, messages, searchChunks, signal }),
  )
}

export const webLlmChatModelAdapter = createChatModelAdapter(webLlmChatModel)
