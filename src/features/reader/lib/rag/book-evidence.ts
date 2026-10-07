import type { SearchChunkResult, SearchChunkSource } from '@/features/ebook-list/ebook-types'

export const BOOK_EVIDENCE_DATA_NAME = 'book-evidence'

export interface BookEvidenceData {
  chunks: readonly SearchChunkResult[]
}

function isSearchChunkSource(value: unknown): value is SearchChunkSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pageNumber' in value &&
    typeof value.pageNumber === 'number' &&
    Number.isSafeInteger(value.pageNumber) &&
    'startLineIndex' in value &&
    typeof value.startLineIndex === 'number' &&
    Number.isSafeInteger(value.startLineIndex) &&
    'endLineIndex' in value &&
    typeof value.endLineIndex === 'number' &&
    Number.isSafeInteger(value.endLineIndex)
  )
}

function isSearchChunkResult(value: unknown): value is SearchChunkResult {
  return (
    typeof value === 'object' &&
    value !== null &&
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

export function isBookEvidenceData(value: unknown): value is BookEvidenceData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chunks' in value &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isSearchChunkResult)
  )
}
