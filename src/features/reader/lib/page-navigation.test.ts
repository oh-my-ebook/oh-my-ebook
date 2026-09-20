import { describe, expect, it } from 'vitest'
import { getPageNavigation } from './page-navigation'

describe('getPageNavigation', () => {
  it('전달받은 이전·다음 이동 대상을 그대로 사용하고 첫·마지막 페이지를 계산한다', () => {
    expect(getPageNavigation(3, 5, 2, 4)).toEqual({
      firstPage: 1,
      previousPage: 2,
      nextPage: 4,
      lastPage: 5,
    })
  })

  it('첫 페이지에서는 이전 이동을 제공하지 않는다', () => {
    expect(getPageNavigation(1, 5, null, 2)).toEqual({
      firstPage: null,
      previousPage: null,
      nextPage: 2,
      lastPage: 5,
    })
  })

  it('마지막 페이지에서는 다음 이동을 제공하지 않는다', () => {
    expect(getPageNavigation(5, 5, 4, null)).toEqual({
      firstPage: 1,
      previousPage: 4,
      nextPage: null,
      lastPage: null,
    })
  })

  it('한 장 문서에서는 앞뒤 이동을 모두 제공하지 않는다', () => {
    expect(getPageNavigation(1, 1, null, null)).toEqual({
      firstPage: null,
      previousPage: null,
      nextPage: null,
      lastPage: null,
    })
  })

  it('두 페이지 보기에서는 전달받은 대상만큼 두 장 단위로 이동한다', () => {
    expect(getPageNavigation(3, 5, 1, 5)).toEqual({
      firstPage: 1,
      previousPage: 1,
      nextPage: 5,
      lastPage: 5,
    })
  })
})
