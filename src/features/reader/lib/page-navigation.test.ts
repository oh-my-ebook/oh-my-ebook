import { describe, expect, it } from 'vitest'
import { getSinglePageNavigation } from './page-navigation'

describe('getSinglePageNavigation', () => {
  it('현재 페이지를 표시하고 바로 앞뒤 페이지로 이동한다', () => {
    expect(getSinglePageNavigation(3, 5)).toEqual({
      pageNumbers: [3],
      firstPage: 1,
      previousPage: 2,
      nextPage: 4,
      lastPage: 5,
    })
  })

  it('첫 페이지에서는 이전 이동을 제공하지 않는다', () => {
    expect(getSinglePageNavigation(1, 5)).toEqual({
      pageNumbers: [1],
      firstPage: null,
      previousPage: null,
      nextPage: 2,
      lastPage: 5,
    })
  })

  it('마지막 페이지에서는 다음 이동을 제공하지 않는다', () => {
    expect(getSinglePageNavigation(5, 5)).toEqual({
      pageNumbers: [5],
      firstPage: 1,
      previousPage: 4,
      nextPage: null,
      lastPage: null,
    })
  })

  it('한 장 문서에서는 앞뒤 이동을 모두 제공하지 않는다', () => {
    expect(getSinglePageNavigation(1, 1)).toEqual({
      pageNumbers: [1],
      firstPage: null,
      previousPage: null,
      nextPage: null,
      lastPage: null,
    })
  })
})
