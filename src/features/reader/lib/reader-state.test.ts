import { describe, expect, it } from 'vitest'
import { calculateSinglePageFitScale } from './reader-state'

describe('calculateSinglePageFitScale', () => {
  it('세로 페이지를 읽기 영역 높이에 맞춘다', () => {
    expect(calculateSinglePageFitScale(800, 1200, 800, 900)).toBe(0.75)
  })

  it('높이 맞춤 결과가 너비를 넘으면 추가로 축소한다', () => {
    expect(calculateSinglePageFitScale(1200, 800, 900, 900)).toBe(0.75)
  })

  it('읽기 영역이 페이지보다 크면 원본 비율로 확대한다', () => {
    expect(calculateSinglePageFitScale(800, 1200, 1000, 1500)).toBe(1.25)
  })
})
