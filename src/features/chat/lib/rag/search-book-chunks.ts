import type { SearchChunkQuery, SearchChunkResult } from '@/lib/ebook-storage/types/search'
import { extractSearchTermsWithKiwi } from '@/lib/kiwi/client'
import type { TextMessagePart, ThreadMessage } from '@assistant-ui/react'

const SEARCH_CHUNK_LIMIT = 5

export type SearchChunks = (query: SearchChunkQuery) => Promise<SearchChunkResult[]>

interface SearchBookChunksOptions {
  bookId: string
  messages: readonly ThreadMessage[]
  signal: AbortSignal
  searchChunks: SearchChunks
}

function isTextPart(part: { type: string }): part is TextMessagePart {
  return part.type === 'text'
}

function getLatestUserQuestion(messages: readonly ThreadMessage[]): string {
  const message = [...messages].reverse().find((candidate) => candidate.role === 'user')
  if (!message) return ''
  return message.content
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')
}

export async function searchBookChunks({
  bookId,
  messages,
  searchChunks,
  signal,
}: SearchBookChunksOptions): Promise<SearchChunkResult[]> {
  const question = getLatestUserQuestion(messages)
  if (!question.trim()) return []

  const searchTerms = await extractSearchTermsWithKiwi(question, signal)
  const terms = [...new Set(searchTerms.map(({ term }) => term.trim()).filter(Boolean))]
  if (terms.length === 0) return []

  const result = await searchChunks({ bookId, terms, limit: SEARCH_CHUNK_LIMIT })
  return result
}
