/// <reference lib="webworker" />

import { COMMAND } from '../../ebook-consts'
import type { EbookStoreResponse } from '../../ebook-types'
import { getErrorCode, UnsupportedCommandError } from './ebook-db.worker.error'
import {
  deletePdf,
  executeOpfsCommand,
  isOpfsCommand,
  readPdf,
  writePdf,
} from './ebook-db.worker.opfs'
import {
  addBook,
  deleteBookById,
  executeSqliteCommand,
  getDatabase,
  getBookMetadata,
  isSqliteCommand,
  getBookId,
} from './ebook-db.worker.sqlite'
import {
  getPayload,
  isAddBookInput,
  isContentHash,
  isWorkerRequest,
  type WorkerRequest,
} from './ebook-db.worker.util'

const workerScope = self as DedicatedWorkerGlobalScope
const COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(COMMAND))
function isLibraryCommand(command: string): command is (typeof COMMAND)[keyof typeof COMMAND] {
  return COMMAND_LIST.has(command)
}

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

async function getBook(request: WorkerRequest): Promise<Record<string, unknown>> {
  const id = getBookId(request)
  const book = getBookMetadata(await getDatabase(), id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  return { ...book, pdf_data: await readPdf(contentHash) }
}

/**
 * OSPF에 저장된 PDF 파일을 삭제한 후, SQLite에 저장된 메타 데이터를 삭제
 * 만약 OSPF 삭제에 실패하면 Error를 발생
 */
async function deleteBook(request: WorkerRequest): Promise<void> {
  const id = getBookId(request)
  const database = await getDatabase()
  const book = getBookMetadata(database, id)
  const contentHash = book.content_hash
  if (!isContentHash(contentHash)) throw new Error('Invalid content hash')

  await deletePdf(contentHash)
  deleteBookById(database, id)
}

function executeLibraryCommand(request: WorkerRequest): Promise<unknown> {
  switch (request.command) {
    case COMMAND.SAVE_BOOK:
      return saveBook(request)
    case COMMAND.GET_BOOK:
      return getBook(request)
    case COMMAND.DELETE_BOOK:
      return deleteBook(request)
    default:
      throw new UnsupportedCommandError(request.command)
  }
}

async function executeCommand(request: WorkerRequest): Promise<unknown> {
  if (isLibraryCommand(request.command)) return await executeLibraryCommand(request)
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
