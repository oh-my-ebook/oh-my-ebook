import { describe, expect, it } from 'vitest'
import { calculatePageFitScale } from './reader-state'

describe('calculatePageFitScale', () => {
  it('세로 페이지를 읽기 영역 높이에 맞춘다', () => {
    expect(calculatePageFitScale([{ width: 800, height: 1200 }], 800, 900)).toBe(0.75)
  })

  it('높이 맞춤 결과가 너비를 넘으면 추가로 축소한다', () => {
    expect(calculatePageFitScale([{ width: 1200, height: 800 }], 900, 900)).toBe(0.75)
  })

  it('읽기 영역이 페이지보다 크면 원본 비율로 확대한다', () => {
    expect(calculatePageFitScale([{ width: 800, height: 1200 }], 1000, 1500)).toBe(1.25)
  })

  it('두 페이지와 사이 간격을 읽기 영역 너비에 맞춘다', () => {
    expect(
      calculatePageFitScale(
        [
          { width: 800, height: 1200 },
          { width: 800, height: 1000 },
        ],
        1000,
        1200,
        16,
      ),
    ).toBe(0.615)
  })
})
