import { GlobalWorkerOptions, getDocument, type PDFPageProxy } from 'pdfjs-dist'
import type { AddBookInput } from '../ebook-types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type PdfImportErrorKind = 'invalid-document' | 'password-required' | 'read-failed'

const errorMessages: Record<PdfImportErrorKind, string> = {
  'invalid-document': '손상되었거나 페이지가 없는 PDF입니다.',
  'password-required': '암호가 필요한 PDF는 추가할 수 없습니다.',
  'read-failed': 'PDF를 읽지 못했습니다.',
}

export class PdfImportError extends Error {
  readonly kind: PdfImportErrorKind

  constructor(kind: PdfImportErrorKind, cause?: unknown) {
    super(errorMessages[kind], { cause })
    this.name = 'PdfImportError'
    this.kind = kind
  }
}

async function renderCover(page: PDFPageProxy) {
  const initial = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(1, 480 / initial.width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')

  try {
    const task = page.render({ canvas, canvasContext: context, viewport })
    await task.promise
    for (const mime of ['image/webp', 'image/png'] as const) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime))
      if (blob?.type === mime) {
        return {
          coverData: await blob.arrayBuffer(),
          coverMime: mime,
          coverStatus: 'ready' as const,
        }
      }
    }
    throw new Error('Cover encoding unavailable')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

function clean(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

function property(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? value[key as keyof typeof value]
    : undefined
}

function readPdfMetadata(info: unknown, metadata: { get(key: string): unknown } | null) {
  const pdfTitle = clean(property(info, 'Title')) || clean(metadata?.get('dc:title'))

  return {
    author: clean(property(info, 'Author')),
    pdfTitle,
    pdfSubject: clean(property(info, 'Subject')),
    pdfKeywords: clean(property(info, 'Keywords')),
    publisher: clean(metadata?.get('dc:publisher')),
  }
}

function generateTitle(pdfTitle: string | null, fileName: string): string {
  return pdfTitle || clean(fileName.replace(/\.pdf$/i, '')) || '제목 없음'
}

export async function analyzePdf(file: File): Promise<AddBookInput> {
  let pdfData: ArrayBuffer
  try {
    pdfData = await file.arrayBuffer()
  } catch (error) {
    throw new PdfImportError('read-failed', error)
  }

  const digest = await crypto.subtle.digest('SHA-256', pdfData)
  const contentHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // PDF.js가 전달받은 버퍼를 worker로 옮길 수 있으므로 저장할 원본은 유지한다.
  const loadingTask = getDocument({ data: new Uint8Array(pdfData.slice(0)) })

  try {
    const document = await loadingTask.promise
    if (document.numPages < 1) throw new PdfImportError('invalid-document')
    const firstPage = await document.getPage(1)
    const { info, metadata } = await document.getMetadata()
    const fileName = file.name.trim()
    const pdfMetadata = readPdfMetadata(info, metadata)
    const title = generateTitle(pdfMetadata.pdfTitle, fileName)
    const cover = await renderCover(firstPage).catch(() => ({
      coverData: null,
      coverMime: null,
      coverStatus: 'fallback' as const,
    }))

    return {
      pdfData,
      contentHash,
      fileName,
      title,
      ...pdfMetadata,
      pdfSize: pdfData.byteLength,
      pageCount: document.numPages,
      ...cover,
    }
  } catch (error) {
    if (error instanceof PdfImportError) throw error
    const name = property(error, 'name')
    if (name === 'PasswordException') throw new PdfImportError('password-required', error)
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
      throw new PdfImportError('invalid-document', error)
    }
    throw new PdfImportError('read-failed', error)
  } finally {
    await loadingTask.destroy()
  }
}
