/// <reference lib="webworker" />

import { COMMAND } from '../../ebook-consts'
import type { EbookStoreResponse } from '../../ebook-types'
import { getErrorCode, UnsupportedCommandError } from './ebook-db.worker.error'
import { executeOpfsCommand, isOpfsCommand, writePdf } from './ebook-db.worker.opfs'
import {
  addBook,
  deleteBookById,
  executeSqliteCommand,
  getDatabase,
  isSqliteCommand,
} from './ebook-db.worker.sqlite'
import {
  getPayload,
  isAddBookInput,
  isWorkerRequest,
  type WorkerRequest,
} from './ebook-db.worker.util'

const workerScope = self as DedicatedWorkerGlobalScope

/**
 * SQLite에 메타 데이터를 먼저 저장한 후, Hash 값을 기반으로 OPFS에 PDF 파일 저장
 * 만약 OPFS 저장에 실패하면 SQLite에 저장한 메타 데이터를 삭제
 */
async function saveBook(request: WorkerRequest): Promise<string> {
  const input = getPayload(request, request.command, isAddBookInput)
  const database = await getDatabase()
  const id = addBook(database, input)

  try {
    await writePdf(input.contentHash, input.pdfData)
    return id
  } catch (error) {
    deleteBookById(database, id)
    throw error
  }
}

async function executeCommand(request: WorkerRequest): Promise<unknown> {
  if (request.command === COMMAND.SAVE_BOOK) return await saveBook(request)
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
