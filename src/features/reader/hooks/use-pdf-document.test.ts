import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createPromiseController, type PromiseController } from '../../../test/promise-controller'
import {
  type LoadedPdfDocument,
  type PdfDocumentHandle,
  type PdfDocumentLoader,
  type PdfPageHandle,
  type PdfDocumentSource,
} from '../lib/pdf-document'
import { usePdfDocument } from './use-pdf-document'

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

function createLoadedDocument(pageCount = 1): LoadedPdfDocument {
  const pages = Array.from({ length: pageCount }, () => createPage(600, 900))
  return {
    document: createDocument(pages),
    pages: pages.map((_, index) => ({
      pageNumber: index + 1,
      width: 800,
      height: 1200,
      rotation: 0,
    })),
  }
}

function createControlledLoader(loads: readonly PromiseController<LoadedPdfDocument>[]) {
  const requestedUrls: PdfDocumentSource[] = []
  const requestSignals: AbortSignal[] = []
  const pendingLoads = [...loads]
  const loadDocument: PdfDocumentLoader = (source, signal) => {
    requestedUrls.push(source)
    requestSignals.push(signal)
    const load = pendingLoads.shift()
    if (!load) {
      return Promise.reject(new Error('No document load'))
    }
    return load.promise
  }
  return { loadDocument, requestedUrls, requestSignals }
}

function createNamedError(name: string) {
  const error = new Error(name)
  error.name = name
  return error
}

describe('usePdfDocument', () => {
  it('문서를 불러오는 동안 로딩 상태를 표시하고 완료된 문서를 제공한다', async () => {
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    const loaded = createLoadedDocument(2)
    const { loadDocument } = createControlledLoader([documentLoad])
    const { result } = renderHook(() => usePdfDocument('/sample.pdf', loadDocument))

    expect(result.current).toMatchObject({
      status: 'loading',
      document: null,
      pages: [],
      error: null,
    })

    await act(async () => {
      documentLoad.resolve(loaded)
      await documentLoad.promise
    })

    expect(result.current).toMatchObject({
      status: 'ready',
      document: loaded.document,
      pages: loaded.pages,
      error: null,
    })
  })

  it('저장된 Uint8Array 원본을 로더에 그대로 전달한다', () => {
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    const { loadDocument, requestedUrls } = createControlledLoader([documentLoad])
    const source = new Uint8Array([1, 2, 3])

    renderHook(() => usePdfDocument(source, loadDocument))

    expect(requestedUrls).toEqual([source])
  })

  it.each([
    ['PasswordException', 'password-required', '암호가 필요한 PDF는 열 수 없습니다.'],
    ['InvalidPDFException', 'invalid-document', '손상되었거나 올바르지 않은 PDF입니다.'],
  ])('%s를 사용자에게 안내할 문서 오류로 변환한다', async (name, kind, message) => {
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    const { loadDocument } = createControlledLoader([documentLoad])
    const { result } = renderHook(() => usePdfDocument('/unreadable.pdf', loadDocument))

    await act(async () => {
      documentLoad.reject(createNamedError(name))
      await documentLoad.promise.catch(() => undefined)
    })

    expect(result.current).toMatchObject({
      status: 'error',
      error: expect.objectContaining({ kind, message }),
    })
  })

  it('실패한 문서를 새 작업으로 다시 불러온다', async () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const retryLoad = createPromiseController<LoadedPdfDocument>()
    const loaded = createLoadedDocument()
    const { loadDocument, requestedUrls, requestSignals } = createControlledLoader([
      firstLoad,
      retryLoad,
    ])
    const { result } = renderHook(() => usePdfDocument('/sample.pdf', loadDocument))

    await act(async () => {
      firstLoad.reject(new Error('network failed'))
      await firstLoad.promise.catch(() => undefined)
    })
    expect(result.current.status).toBe('error')

    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    expect(requestedUrls).toEqual(['/sample.pdf', '/sample.pdf'])

    await act(async () => {
      retryLoad.resolve(loaded)
      await retryLoad.promise
    })
    expect(result.current).toMatchObject({ status: 'ready', document: loaded.document })
    expect(requestSignals[0]?.aborted).toBe(true)
  })

  it('URL이 바뀌면 이전 작업을 해제하고 새 문서를 불러온다', () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoad = createPromiseController<LoadedPdfDocument>()
    const { loadDocument, requestedUrls, requestSignals } = createControlledLoader([
      firstLoad,
      secondLoad,
    ])
    const { result, rerender } = renderHook(({ url }) => usePdfDocument(url, loadDocument), {
      initialProps: { url: '/first.pdf' },
    })

    rerender({ url: '/second.pdf' })

    expect(result.current.status).toBe('loading')
    expect(requestedUrls).toEqual(['/first.pdf', '/second.pdf'])
    expect(requestSignals[0]?.aborted).toBe(true)
  })

  it('이전 URL의 늦은 완료가 최신 문서를 덮어쓰지 않는다', async () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoad = createPromiseController<LoadedPdfDocument>()
    const firstLoaded = createLoadedDocument(1)
    const secondLoaded = createLoadedDocument(2)
    const { loadDocument } = createControlledLoader([firstLoad, secondLoad])
    const { result, rerender } = renderHook(({ url }) => usePdfDocument(url, loadDocument), {
      initialProps: { url: '/first.pdf' },
    })

    rerender({ url: '/second.pdf' })
    await act(async () => {
      secondLoad.resolve(secondLoaded)
      await secondLoad.promise
    })
    await act(async () => {
      firstLoad.resolve(firstLoaded)
      await firstLoad.promise
    })

    expect(result.current).toMatchObject({
      status: 'ready',
      document: secondLoaded.document,
      pages: secondLoaded.pages,
    })
  })

  it('이전 URL의 늦은 오류가 최신 문서를 덮어쓰지 않는다', async () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoaded = createLoadedDocument(2)
    const { loadDocument } = createControlledLoader([firstLoad, secondLoad])
    const { result, rerender } = renderHook(({ url }) => usePdfDocument(url, loadDocument), {
      initialProps: { url: '/first.pdf' },
    })

    rerender({ url: '/second.pdf' })
    await act(async () => {
      secondLoad.resolve(secondLoaded)
      await secondLoad.promise
    })
    await act(async () => {
      firstLoad.reject(new Error('late failure'))
      await firstLoad.promise.catch(() => undefined)
    })

    expect(result.current).toMatchObject({
      status: 'ready',
      document: secondLoaded.document,
      pages: secondLoaded.pages,
      error: null,
    })
  })

  it('이전 URL로 돌아가도 해제된 문서 상태를 재사용하지 않는다', async () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoad = createPromiseController<LoadedPdfDocument>()
    const thirdLoad = createPromiseController<LoadedPdfDocument>()
    const firstLoaded = createLoadedDocument(1)
    const thirdLoaded = createLoadedDocument(3)
    const { loadDocument, requestedUrls, requestSignals } = createControlledLoader([
      firstLoad,
      secondLoad,
      thirdLoad,
    ])
    const { result, rerender } = renderHook(({ url }) => usePdfDocument(url, loadDocument), {
      initialProps: { url: '/first.pdf' },
    })

    await act(async () => {
      firstLoad.resolve(firstLoaded)
      await firstLoad.promise
    })
    rerender({ url: '/second.pdf' })
    rerender({ url: '/first.pdf' })

    expect(result.current.status).toBe('loading')
    expect(requestedUrls).toEqual(['/first.pdf', '/second.pdf', '/first.pdf'])
    expect(requestSignals[0]?.aborted).toBe(true)
    expect(requestSignals[1]?.aborted).toBe(true)

    await act(async () => {
      thirdLoad.resolve(thirdLoaded)
      await thirdLoad.promise
    })
    expect(result.current).toMatchObject({
      status: 'ready',
      document: thirdLoaded.document,
    })
  })

  it('StrictMode의 반복 setup에서 해제한 작업을 재사용하지 않는다', async () => {
    const firstLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoad = createPromiseController<LoadedPdfDocument>()
    const secondLoaded = createLoadedDocument()
    const { loadDocument, requestedUrls, requestSignals } = createControlledLoader([
      firstLoad,
      secondLoad,
    ])
    const { result } = renderHook(() => usePdfDocument('/sample.pdf', loadDocument), {
      wrapper: StrictMode,
    })

    expect(requestedUrls).toEqual(['/sample.pdf', '/sample.pdf'])
    expect(requestSignals[0]?.aborted).toBe(true)

    await act(async () => {
      secondLoad.resolve(secondLoaded)
      await secondLoad.promise
    })
    expect(result.current).toMatchObject({
      status: 'ready',
      document: secondLoaded.document,
    })
  })

  it('unmount하면 진행 중인 작업을 해제한다', () => {
    const documentLoad = createPromiseController<LoadedPdfDocument>()
    const { loadDocument, requestSignals } = createControlledLoader([documentLoad])
    const { unmount } = renderHook(() => usePdfDocument('/sample.pdf', loadDocument))

    unmount()

    expect(requestSignals[0]?.aborted).toBe(true)
  })
})
