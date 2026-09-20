import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import {
  extractPdfPageText,
  loadPdfDocument,
  type PdfDocumentHandle,
  type PdfPageHandle,
} from './pdf-document'

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

    const documentData = getDocumentMock.mock.calls[0][0]

    expect(documentData.data).not.toBe(data)
    expect(documentData.data).toEqual(data)
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

describe('extractPdfPageText', () => {
  // 글자 폭 측정은 jsdom이 구현하지 않는 Canvas 2D 컨텍스트를 사용한다.
  function mockTextMeasurement(measuredWidth: number) {
    const context = { font: '', measureText: vi.fn(() => ({ width: measuredWidth })) }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    )
  }

  function createTextPage(items: readonly unknown[], rotation = 0) {
    return {
      // PDF 좌표는 아래에서 위로 커지므로 화면 좌표로 옮길 때 y축을 뒤집는다.
      getViewport: vi.fn(() => ({
        width: 600,
        height: 800,
        rotation,
        convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
      })),
      getTextContent: vi.fn().mockResolvedValue({ items }),
    }
  }

  afterEach(() => vi.restoreAllMocks())

  it('내장 텍스트를 선택할 수 있는 화면 좌표로 바꾼다', async () => {
    mockTextMeasurement(200)
    const page = createTextPage([
      { str: ' ', transform: [12, 0, 0, 12, 90, 700], width: 3, height: 12 },
      { str: '내장 문장', transform: [12, 0, 0, 12, 100, 700], width: 400, height: 12 },
    ])

    const result = await extractPdfPageText(page, new AbortController().signal)

    // 측정 폭 200px을 상자 폭 400px에 맞추려고 가로로 2배 늘린다.
    expect(result).toEqual({
      width: 600,
      height: 800,
      lines: [{ text: '내장 문장', x0: 100, y0: 88, x1: 500, y1: 100, fontSize: 12, scaleX: 2 }],
    })
  })

  it('공백 외 글자가 없는 스캔 페이지는 null을 반환한다', async () => {
    const page = createTextPage([
      { str: ' ', transform: [12, 0, 0, 12, 0, 0], width: 3, height: 12 },
    ])

    await expect(extractPdfPageText(page, new AbortController().signal)).resolves.toBeNull()
  })

  it('회전된 페이지는 글자가 있어도 null을 반환한다', async () => {
    const page = createTextPage(
      [{ str: '세로 문장', transform: [12, 0, 0, 12, 0, 0], width: 60, height: 12 }],
      90,
    )

    await expect(extractPdfPageText(page, new AbortController().signal)).resolves.toBeNull()
  })

  it('텍스트를 읽을 수 없는 페이지는 null을 반환한다', async () => {
    const page: PdfPageHandle = createPage(600, 800)

    await expect(extractPdfPageText(page, new AbortController().signal)).resolves.toBeNull()
  })
})
