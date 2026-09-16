import { describe, expect, it } from 'vitest'
import {
  FIT_HEIGHT_ZOOM,
  calculateFitHeightScale,
  canDecreaseZoom,
  canIncreaseZoom,
  decreaseZoom,
  getZoomScale,
  increaseZoom,
} from './reader-zoom'

describe('calculateFitHeightScale', () => {
  it('한 페이지를 가용 높이에 맞춘다', () => {
    expect(
      calculateFitHeightScale([{ width: 800, height: 1200 }], {
        width: 1000,
        height: 900,
      }),
    ).toBe(0.75)
  })

  it('두 페이지에 같은 배율을 적용해 가용 높이에 맞춘다', () => {
    expect(
      calculateFitHeightScale(
        [
          { width: 400, height: 1000 },
          { width: 500, height: 1200 },
        ],
        { width: 1000, height: 900 },
        20,
      ),
    ).toBe(0.75)
  })

  it('페이지 사이의 고정 간격을 제외한 너비에 맞춘다', () => {
    expect(
      calculateFitHeightScale(
        [
          { width: 600, height: 800 },
          { width: 600, height: 800 },
        ],
        { width: 624, height: 1000 },
        24,
      ),
    ).toBe(0.5)
  })

  it('높이 맞춤 결과가 가용 너비를 넘으면 추가로 축소한다', () => {
    expect(
      calculateFitHeightScale([{ width: 1200, height: 800 }], {
        width: 900,
        height: 900,
      }),
    ).toBe(0.75)
  })

  it('수동 배율 상한을 넘겨서도 가용 영역에 맞춘다', () => {
    expect(
      calculateFitHeightScale([{ width: 100, height: 100 }], {
        width: 400,
        height: 400,
      }),
    ).toBe(4)
  })
})

describe('수동 배율', () => {
  it('25%부터 300%까지 25%p씩 증감한다', () => {
    expect(increaseZoom({ mode: 'manual', scale: 0.25 }, 1)).toEqual({
      mode: 'manual',
      scale: 0.5,
    })
    expect(decreaseZoom({ mode: 'manual', scale: 3 }, 1)).toEqual({
      mode: 'manual',
      scale: 2.75,
    })
  })

  it('높이 맞춤에서 조작하면 현재 표시 배율을 기준으로 수동 배율로 전환한다', () => {
    const zoomed = increaseZoom(FIT_HEIGHT_ZOOM, 0.75)

    expect(zoomed).toEqual({ mode: 'manual', scale: 1 })
    expect(getZoomScale(zoomed, 0.5)).toBe(1)
    expect(getZoomScale(FIT_HEIGHT_ZOOM, 0.5)).toBe(0.5)
  })

  it('수동 조작 뒤 높이 맞춤으로 복귀할 수 있다', () => {
    const zoomed = increaseZoom(FIT_HEIGHT_ZOOM, 0.75)

    expect(getZoomScale(zoomed, 0.5)).toBe(1)
    expect(getZoomScale(FIT_HEIGHT_ZOOM, 0.5)).toBe(0.5)
  })

  it('상한 이상에서는 확대하고 하한 이하에서는 축소하지 않는다', () => {
    expect(canIncreaseZoom(3)).toBe(false)
    expect(canIncreaseZoom(4)).toBe(false)
    expect(increaseZoom({ mode: 'manual', scale: 3 }, 1)).toEqual({
      mode: 'manual',
      scale: 3,
    })

    expect(canDecreaseZoom(0.25)).toBe(false)
    expect(canDecreaseZoom(0.1)).toBe(false)
    expect(decreaseZoom(FIT_HEIGHT_ZOOM, 0.1)).toBe(FIT_HEIGHT_ZOOM)
  })

  it('한도 밖의 맞춤 배율에서 반대 방향으로 조작하면 수동 범위로 돌아온다', () => {
    expect(decreaseZoom(FIT_HEIGHT_ZOOM, 4)).toEqual({ mode: 'manual', scale: 3 })
    expect(increaseZoom(FIT_HEIGHT_ZOOM, 0.1)).toEqual({ mode: 'manual', scale: 0.35 })
  })
})
