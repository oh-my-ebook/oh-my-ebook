/// <reference lib="webworker" />

import type { EbookStoreResponse } from '../../ebook-types'
import { getErrorCode, UnsupportedCommandError } from './ebook-db.worker.error'
import { executeOpfsCommand, isOpfsCommand } from './ebook-db.worker.opfs'
import { executeSqliteCommand, getDatabase, isSqliteCommand } from './ebook-db.worker.sqlite'
import { isWorkerRequest, type WorkerRequest } from './ebook-db.worker.util'

const workerScope = self as DedicatedWorkerGlobalScope

async function executeCommand(request: WorkerRequest): Promise<unknown> {
  if (isOpfsCommand(request.command)) return await executeOpfsCommand(request)
  if (isSqliteCommand(request.command)) return executeSqliteCommand(await getDatabase(), request)
  throw new UnsupportedCommandError(request.command)
}

async function respondToRequest(request: WorkerRequest): Promise<void> {
  const { requestId, command } = request
  try {
    const result = await executeCommand(request)
    workerScope.postMessage({ requestId, result: result ?? null } satisfies EbookStoreResponse)
  } catch (error) {
    const code = getErrorCode(error)
    if (code === 'storage-failed') {
      console.error('ebook-db.worker command failed', { command, error })
    }
    workerScope.postMessage({ requestId, error: { code } } satisfies EbookStoreResponse)
  }
}

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  if (!isWorkerRequest(event.data)) return
  await respondToRequest(event.data)
}
