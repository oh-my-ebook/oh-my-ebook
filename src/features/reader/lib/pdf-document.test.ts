import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import { loadPdfDocument, type PdfDocumentHandle, type PdfPageHandle } from './pdf-document'

const getDocumentMock = vi.hoisted(() => vi.fn())

vi.mock('pdfjs-dist', async (importOriginal) => {
  const pdfjs = await importOriginal<typeof import('pdfjs-dist')>()
  return { ...pdfjs, getDocument: getDocumentMock }
})

function createPage(width: number, height: number, rotation = 0): PdfPageHandle {
  return {
    getViewport: ({ scale }) => ({
      width: width * scale,
      height: height * scale,
      rotation,
    }),
  }
}

function createDocument(pages: readonly PdfPageHandle[]): PdfDocumentHandle {
  return {
    numPages: pages.length,
    async getPage(pageNumber) {
      const page = pages[pageNumber - 1]
      if (!page) {
        throw new Error(`Missing page ${pageNumber}`)
      }
      return page
    },
  }
}

function createNamedError(name: string) {
  const error = new Error(name)
  error.name = name
  return error
}

describe('PDF.js worker 설정', () => {
  it('설치된 PDF.js 패키지의 worker URL을 사용한다', () => {
    expect(GlobalWorkerOptions.workerSrc).toBe(pdfWorkerUrl)
  })
})

describe('loadPdfDocument', () => {
  beforeEach(() => {
    getDocumentMock.mockReset()
  })

  it('모든 페이지에서 회전이 적용된 CSS 기준 크기를 조회한다', async () => {
    const document = createDocument([createPage(600, 900), createPage(900, 600, 90)])
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve(document),
      destroy: vi.fn(async () => undefined),
    })
    const controller = new AbortController()

    const loaded = await loadPdfDocument('/sample.pdf', controller.signal)

    expect(loaded.document).toBe(document)
    expect(loaded.pages).toEqual([
      { pageNumber: 1, width: 800, height: 1200, rotation: 0 },
      { pageNumber: 2, width: 1200, height: 800, rotation: 90 },
    ])
  })

  it('저장된 Uint8Array 원본을 PDF.js 데이터로 전달한다', async () => {
    const document = createDocument([createPage(600, 900)])
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve(document),
      destroy: vi.fn(async () => undefined),
    })
    const controller = new AbortController()
    const data = new Uint8Array([1, 2, 3])

    await loadPdfDocument(data, controller.signal)

    expect(getDocumentMock).toHaveBeenCalledWith({ data })
  })

  it('페이지 크기 조회가 실패하면 페이지 정보 오류로 변환한다', async () => {
    const document: PdfDocumentHandle = {
      numPages: 1,
      async getPage() {
        throw new Error('page lookup failed')
      },
    }
    const destroy = vi.fn(async () => undefined)
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(document), destroy })
    const controller = new AbortController()

    await expect(loadPdfDocument('/sample.pdf', controller.signal)).rejects.toMatchObject({
      kind: 'page-info',
      message: 'PDF 페이지 정보를 불러오지 못했습니다.',
    })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('AbortSignal이 중단되면 PDF.js 로딩 작업을 해제한다', async () => {
    const documentLoad = createPromiseController<PdfDocumentHandle>()
    const destroy = vi.fn(async () => {
      documentLoad.reject(createNamedError('AbortException'))
    })
    getDocumentMock.mockReturnValue({ promise: documentLoad.promise, destroy })
    const controller = new AbortController()

    const loading = loadPdfDocument('/sample.pdf', controller.signal)
    controller.abort()

    await expect(loading).rejects.toBe(controller.signal.reason)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('문서 로딩 후 중단해도 PDF.js 작업을 해제한다', async () => {
    const document = createDocument([createPage(600, 900)])
    const destroy = vi.fn(async () => undefined)
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(document), destroy })
    const controller = new AbortController()

    const loaded = await loadPdfDocument('/sample.pdf', controller.signal)
    controller.abort()

    expect(loaded.document).toBe(document)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('중단 중 destroy가 실패해도 처리되지 않은 rejection을 남기지 않는다', async () => {
    const document = createDocument([createPage(600, 900)])
    const destroy = vi.fn(async () => {
      throw new Error('destroy failed')
    })
    getDocumentMock.mockReturnValue({ promise: Promise.resolve(document), destroy })
    const controller = new AbortController()

    await loadPdfDocument('/sample.pdf', controller.signal)
    controller.abort()

    expect(destroy).toHaveBeenCalledOnce()
  })

  it('문서 오류와 destroy 실패를 함께 보존한다', async () => {
    const documentError = createNamedError('InvalidPDFException')
    const destroyError = new Error('destroy failed')
    const destroy = vi.fn(async () => {
      throw destroyError
    })
    getDocumentMock.mockReturnValue({ promise: Promise.reject(documentError), destroy })
    const controller = new AbortController()

    await expect(loadPdfDocument('/broken.pdf', controller.signal)).rejects.toMatchObject({
      kind: 'invalid-document',
      cause: expect.objectContaining({
        errors: [
          expect.objectContaining({ kind: 'invalid-document', cause: documentError }),
          destroyError,
        ],
      }),
    })
    expect(destroy).toHaveBeenCalledOnce()
  })
})
