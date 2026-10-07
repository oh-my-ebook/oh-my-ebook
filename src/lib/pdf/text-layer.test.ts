import { describe, expect, it } from 'vitest'
import { fitTextLines } from './text-layer'

describe('fitTextLines', () => {
  it('글자 상자를 선택 가능한 한 줄 텍스트 크기로 맞춘다', () => {
    const lines = fitTextLines(
      [
        {
          text: '  한국어 OCR  ',
          bbox: { x0: 10, y0: 20, x1: 210, y1: 40 },
          rowHeight: 18,
        },
        { text: '', bbox: { x0: 0, y0: 0, x1: 100, y1: 20 } },
        { text: '잘못된 상자', bbox: { x0: 10, y0: 10, x1: 5, y1: 20 } },
      ],
      (_text: string, fontSize: number) => fontSize * 5,
    )

    expect(lines).toEqual([
      {
        text: '한국어 OCR',
        x0: 10,
        y0: 20,
        x1: 210,
        y1: 40,
        fontSize: 18,
        scaleX: 200 / 90,
      },
    ])
  })

  it('과도한 가로 배율은 읽을 수 있는 범위로 제한한다', () => {
    const [line] = fitTextLines(
      [{ text: '가', bbox: { x0: 0, y0: 0, x1: 1_000, y1: 20 } }],
      () => 10,
    )

    expect(line.scaleX).toBe(4)
  })
})
