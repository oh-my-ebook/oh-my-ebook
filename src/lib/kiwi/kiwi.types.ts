import type { KiwiRequestType, KIWI_REQUEST } from './const'

export interface KiwiTools {
  tokenize(text: string): Array<{ str: string; tag: string }>
  joinSent(morphs: Array<{ form: string; tag: string }>): { str: string }
}

export interface KiwiSearchTerm {
  term: string
  frequency: number
}

export interface KiwiWorkerRequest {
  id: number
  type: KiwiRequestType
  text: string
}

export interface PendingRequest {
  type: KiwiRequestType
  resolve(result: unknown): void
  reject(error: unknown): void
  removeAbortListener(): void
}

interface NormalizeTextResponse {
  id: number
  ok: true
  type: typeof KIWI_REQUEST.NORMALIZE_TEXT
  text: string
}

interface ExtractSearchTermsResponse {
  id: number
  ok: true
  type: typeof KIWI_REQUEST.EXTRACT_SEARCH_TERMS
  terms: KiwiSearchTerm[]
}

interface FailureResponse {
  id: number
  ok: false
  type: KiwiRequestType
  error: string
}

export type KiwiWorkerResponse =
  NormalizeTextResponse | ExtractSearchTermsResponse | FailureResponse
