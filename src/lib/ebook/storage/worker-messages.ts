import type { EbookStoreCommand } from './commands'

export interface EbookWorkerRequest {
  requestId: number
  command: EbookStoreCommand
  payload?: unknown
}

export type EbookStoreResponse =
  { requestId: number; result: unknown } | { requestId: number; error: { code: string } }
