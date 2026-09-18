import { OPFS_COMMAND } from '../../ebook-consts'
import { UnsupportedCommandError } from './ebook-db.worker.error'
import {
  getPayload,
  isContentHash,
  isPdfWriteInput,
  type WorkerRequest,
} from './ebook-db.worker.util'

type OpfsCommand = (typeof OPFS_COMMAND)[keyof typeof OPFS_COMMAND]

const OPFS_COMMAND_LIST: ReadonlySet<string> = new Set(Object.values(OPFS_COMMAND))

export function isOpfsCommand(command: string): command is OpfsCommand {
  return OPFS_COMMAND_LIST.has(command)
}

function getContentHash(request: WorkerRequest): string {
  return getPayload(request, request.command, isContentHash)
}

const PDF_DIRECTORY_NAME = 'pdfs'
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/

// pdfs/<SHA-256 해시>.pdf 기반으로 OPFS 저장소에 저장
function getPdfFileName(contentHash: string): string {
  if (!CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new TypeError('PDF 파일 이름에는 SHA-256 콘텐츠 해시가 필요합니다.')
  }
  return `${contentHash}.pdf`
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotFoundError'
  )
}

async function getPdfDirectory(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return await root.getDirectoryHandle(PDF_DIRECTORY_NAME, { create })
}

export async function writePdf(contentHash: string, pdfData: ArrayBuffer): Promise<void> {
  const fileName = getPdfFileName(contentHash)
  const directory = await getPdfDirectory(true)
  const file = await directory.getFileHandle(fileName, { create: true })
  const writable = await file.createWritable()

  try {
    await writable.write(pdfData)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

export async function readPdf(contentHash: string): Promise<Uint8Array> {
  const fileName = getPdfFileName(contentHash)
  const directory = await getPdfDirectory(false)
  const file = await directory.getFileHandle(fileName)
  return new Uint8Array(await (await file.getFile()).arrayBuffer())
}

export async function deletePdf(contentHash: string): Promise<void> {
  const fileName = getPdfFileName(contentHash)

  try {
    const directory = await getPdfDirectory(false)
    await directory.removeEntry(fileName)
  } catch (error) {
    if (!isNotFoundError(error)) throw error
  }
}

export async function executeOpfsCommand(request: WorkerRequest): Promise<unknown> {
  switch (request.command) {
    case OPFS_COMMAND.WRITE_PDF: {
      const input = getPayload(request, request.command, isPdfWriteInput)
      await writePdf(input.contentHash, input.pdfData)
      return undefined
    }
    case OPFS_COMMAND.READ_PDF:
      return await readPdf(getContentHash(request))
    case OPFS_COMMAND.DELETE_PDF:
      await deletePdf(getContentHash(request))
      return undefined
    default:
      throw new UnsupportedCommandError(request.command)
  }
}
