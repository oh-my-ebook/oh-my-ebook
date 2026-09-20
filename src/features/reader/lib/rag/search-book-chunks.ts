import type { TextMessagePart, ThreadMessage } from '@assistant-ui/react'
import { extractSearchTermsWithKiwi } from '@/lib/kiwi/client'
import type {
  SearchChunkQuery,
  SearchChunkResult,
  SearchChunkSource,
} from '@/features/ebook-list/ebook-types'

const SEARCH_CHUNK_LIMIT = 5

export interface SearchChunkStore {
  request(command: 'searchChunks', payload: SearchChunkQuery): Promise<unknown>
}

interface SearchBookChunksOptions {
  bookId: string
  messages: readonly ThreadMessage[]
  signal: AbortSignal
  store: SearchChunkStore
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

function isSearchChunkSource(value: unknown): value is SearchChunkSource {
  if (typeof value !== 'object' || value === null) return false
  return (
    'pageNumber' in value &&
    typeof value.pageNumber === 'number' &&
    'startLineIndex' in value &&
    typeof value.startLineIndex === 'number' &&
    'endLineIndex' in value &&
    typeof value.endLineIndex === 'number'
  )
}

function isSearchChunkResult(value: unknown): value is SearchChunkResult {
  if (typeof value !== 'object' || value === null) return false
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'ordinal' in value &&
    typeof value.ordinal === 'number' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'tokenCount' in value &&
    typeof value.tokenCount === 'number' &&
    'score' in value &&
    typeof value.score === 'number' &&
    'sources' in value &&
    Array.isArray(value.sources) &&
    value.sources.every(isSearchChunkSource)
  )
}

export async function searchBookChunks({
  bookId,
  messages,
  signal,
  store,
}: SearchBookChunksOptions): Promise<SearchChunkResult[]> {
  const question = getLatestUserQuestion(messages)
  if (!question.trim()) return []

  const searchTerms = await extractSearchTermsWithKiwi(question, signal)
  const terms = [...new Set(searchTerms.map(({ term }) => term.trim()).filter(Boolean))]
  if (terms.length === 0) return []

  const result = await store.request('searchChunks', { bookId, terms, limit: SEARCH_CHUNK_LIMIT })
  if (!Array.isArray(result) || !result.every(isSearchChunkResult)) {
    throw new Error('Invalid search chunks')
  }
  return result
}
