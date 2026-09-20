import { describe, expect, it } from 'vitest'
import { getPageNavigation } from './page-navigation'

describe('getPageNavigation', () => {
  it('전달받은 이전·다음 이동 대상을 그대로 사용하고 첫·마지막 페이지를 계산한다', () => {
    expect(getPageNavigation(5, 2, 4)).toEqual({
      firstPage: 1,
      previousPage: 2,
      nextPage: 4,
      lastPage: 5,
    })
  })

  it('이전 이동 대상이 없으면 첫 페이지 이동도 제공하지 않는다', () => {
    expect(getPageNavigation(5, null, 2)).toEqual({
      firstPage: null,
      previousPage: null,
      nextPage: 2,
      lastPage: 5,
    })
  })

  it('다음 이동 대상이 없으면 마지막 페이지 이동도 제공하지 않는다', () => {
    expect(getPageNavigation(5, 4, null)).toEqual({
      firstPage: 1,
      previousPage: 4,
      nextPage: null,
      lastPage: null,
    })
  })

  it('앞뒤 이동 대상이 모두 없으면 첫·마지막 이동도 모두 제공하지 않는다', () => {
    expect(getPageNavigation(1, null, null)).toEqual({
      firstPage: null,
      previousPage: null,
      nextPage: null,
      lastPage: null,
    })
  })

  it('두 페이지 보기 묶음 안에서는 같은 묶음을 벗어나지 못하는 첫·마지막 이동을 제공하지 않는다', () => {
    // 6장을 [1,2],[3,4],[5,6]으로 묶었을 때 묶음의 두 번째 페이지에서는
    // previousPage가, 마지막 묶음의 첫 페이지에서는 nextPage가 이미 null이다.
    expect(getPageNavigation(6, null, 3)).toEqual({
      firstPage: null,
      previousPage: null,
      nextPage: 3,
      lastPage: 6,
    })
    expect(getPageNavigation(6, 3, null)).toEqual({
      firstPage: 1,
      previousPage: 3,
      nextPage: null,
      lastPage: null,
    })
  })
})
