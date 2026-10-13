import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzePdf } from './pdf-import'

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }))
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument }))

function setupCover(encode: (mime: string | undefined) => Blob | null) {
  const canvases: HTMLCanvasElement[] = []
  const sizes: number[][] = []
  const destroy = vi.fn(async () => undefined)
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 900 * scale, height: 600 * scale }),
    render: ({ canvas }: { canvas: HTMLCanvasElement }) => {
      canvases.push(canvas)
      sizes.push([canvas.width, canvas.height])
      return { promise: Promise.resolve() }
    },
  }
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => page,
      getMetadata: async () => ({ info: {}, metadata: null }),
    }),
    destroy,
  })
  // PDF.js의 렌더링 경계만 대체하므로 Canvas 메서드는 호출되지 않는다.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, mime) =>
    callback(encode(mime)),
  )
  return { canvases, sizes, destroy }
}

afterEach(() => {
  vi.restoreAllMocks()
  getDocument.mockReset()
})

describe('PDF 표지 인코딩', () => {
  it('WebP를 만들 수 없으면 PNG 표지를 반환하고 Canvas를 정리한다', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const { canvases, sizes, destroy } = setupCover((mime) => (mime === 'image/png' ? png : null))

    const book = await analyzePdf(new File(['pdf'], 'rotated.pdf'))

    expect(book).toMatchObject({
      coverStatus: 'ready',
      coverMime: 'image/png',
      coverData: await png.arrayBuffer(),
    })
    expect(sizes).toEqual([[480, 320]])
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([[0, 0]])
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('인코딩에 모두 실패해도 원본은 유지하고 기본 표지와 정리된 Canvas를 반환한다', async () => {
    const { canvases, destroy } = setupCover(() => null)
    const file = new File(['pdf'], 'book.pdf')

    const book = await analyzePdf(file)

    expect(book).toMatchObject({
      pdfData: await file.arrayBuffer(),
      coverStatus: 'fallback',
      coverData: null,
      coverMime: null,
    })
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([[0, 0]])
    expect(destroy).toHaveBeenCalledOnce()
  })
})
