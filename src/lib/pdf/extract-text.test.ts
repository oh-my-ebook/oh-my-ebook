import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfPageHandle } from './document'
import { extractPdfPageText } from './extract-text'

function createPage(width: number, height: number, rotation = 0): PdfPageHandle {
  return {
    getViewport: ({ scale }) => ({
      width: width * scale,
      height: height * scale,
      rotation,
    }),
  }
}

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
