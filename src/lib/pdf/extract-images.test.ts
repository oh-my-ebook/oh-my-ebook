import { OPS } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { extractPdfPageImages } from './extract-images'

describe('extractPdfPageImages', () => {
  const PAGE = { width: 600, height: 800 }

  function createImagePage(operators: readonly (readonly [number, unknown])[]) {
    return {
      // PDF 좌표는 아래에서 위로 커지므로 화면 좌표로 옮길 때 y축을 뒤집는다.
      getViewport: vi.fn(() => ({
        ...PAGE,
        rotation: 0,
        convertToViewportPoint: (x: number, y: number) => [x, PAGE.height - y],
      })),
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: operators.map(([fn]) => fn),
        argsArray: operators.map(([, args]) => args),
      }),
    }
  }

  // 이미지는 변환 행렬이 단위 정사각형을 펼친 자리에 그려진다.
  function drawImage(matrix: readonly number[]) {
    return [
      [OPS.save, null],
      [OPS.transform, matrix],
      [OPS.paintImageXObject, ['img_1', 200, 100]],
      [OPS.restore, null],
    ] as const satisfies readonly (readonly [number, unknown])[]
  }

  it('이미지가 그려진 자리를 화면 좌표 영역으로 계산한다', async () => {
    const page = createImagePage(drawImage([200, 0, 0, 100, 50, 600]))

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result).toEqual({
      ...PAGE,
      regions: [{ x0: 50, y0: 100, x1: 250, y1: 200 }],
    })
  })

  it('Form XObject 안에서 그려진 이미지도 찾는다', async () => {
    const page = createImagePage([
      [OPS.paintFormXObjectBegin, [[2, 0, 0, 2, 0, 0], null]],
      [OPS.transform, [100, 0, 0, 50, 25, 300]],
      [OPS.paintImageXObject, ['img_1', 200, 100]],
      [OPS.paintFormXObjectEnd, null],
    ])

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result?.regions).toEqual([{ x0: 50, y0: 100, x1: 250, y1: 200 }])
  })

  it('페이지를 거의 덮는 스캔 이미지는 영역으로 보지 않는다', async () => {
    const page = createImagePage(drawImage([600, 0, 0, 800, 0, 0]))

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result?.regions).toEqual([])
  })

  it('아이콘처럼 작은 이미지는 영역으로 보지 않는다', async () => {
    const page = createImagePage(drawImage([16, 0, 0, 16, 10, 700]))

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result?.regions).toEqual([])
  })

  it('조각으로 나뉘어 그려진 이미지는 하나의 영역으로 합친다', async () => {
    const page = createImagePage([
      ...drawImage([100, 0, 0, 50, 50, 600]),
      ...drawImage([100, 0, 0, 50, 50, 650]),
    ])

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result?.regions).toEqual([{ x0: 50, y0: 100, x1: 150, y1: 200 }])
  })

  it('병합하며 커진 영역이 다른 조각과 맞닿으면 다시 합친다', async () => {
    const page = createImagePage([
      ...drawImage([50, 0, 0, 50, 0, 600]),
      ...drawImage([50, 0, 0, 50, 100, 600]),
      ...drawImage([52, 0, 0, 50, 49, 600]),
    ])

    const result = await extractPdfPageImages(page, new AbortController().signal)

    expect(result?.regions).toEqual([{ x0: 0, y0: 150, x1: 150, y1: 200 }])
  })
})
