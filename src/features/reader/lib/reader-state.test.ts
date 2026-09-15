import { describe, expect, it } from 'vitest'
import { calculateSinglePageFitScale } from './reader-state'

describe('calculateSinglePageFitScale', () => {
  it.each([
    { availableWidth: 800, expectedScale: 1, pageWidth: 800 },
    { availableWidth: 600, expectedScale: 0.75, pageWidth: 800 },
    { availableWidth: 1000, expectedScale: 1.25, pageWidth: 800 },
  ])(
    '폭이 $pageWidth인 페이지를 $availableWidth에 맞추면 배율은 $expectedScale이다',
    ({ availableWidth, expectedScale, pageWidth }) => {
      expect(calculateSinglePageFitScale(pageWidth, availableWidth)).toBe(expectedScale)
    },
  )
})
