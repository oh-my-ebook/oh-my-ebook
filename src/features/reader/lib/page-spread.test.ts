import { describe, expect, it } from 'vitest'
import type { PdfPageInfo } from './pdf-document'
import { calculatePageSpread, getPageOrientation, isTwoPageViewAvailable } from './page-spread'

function createPage(pageNumber: number, width = 600, height = 900): PdfPageInfo {
  return { pageNumber, width, height, rotation: 0 }
}

function getPageNumbers(pages: readonly PdfPageInfo[]) {
  return pages.map(({ pageNumber }) => pageNumber)
}

describe('getPageOrientation', () => {
  it('회전이 적용된 크기에서 폭이 더 넓은 페이지만 가로로 분류한다', () => {
    expect(getPageOrientation(createPage(1, 900, 600))).toBe('landscape')
    expect(getPageOrientation(createPage(2, 600, 900))).toBe('portrait')
    expect(getPageOrientation(createPage(3, 600, 600))).toBe('portrait')
  })
})

describe('isTwoPageViewAvailable', () => {
  it.each([
    { screenWidth: 1023, availableWidth: 1000, expected: false },
    { screenWidth: 1024, availableWidth: 999, expected: false },
    { screenWidth: 1024, availableWidth: 1000, expected: true },
  ])(
    '화면 $screenWidth px와 읽기 영역 $availableWidth px를 독립적으로 확인한다',
    ({ screenWidth, availableWidth, expected }) => {
      expect(isTwoPageViewAvailable(screenWidth, availableWidth)).toBe(expected)
    },
  )
})

describe('calculatePageSpread', () => {
  it('한 페이지 보기에서는 현재 페이지만 표시하고 한 장씩 이동한다', () => {
    const pages = Array.from({ length: 5 }, (_, index) => createPage(index + 1))

    const spread = calculatePageSpread(pages, 3, 'single', true)

    expect(getPageNumbers(spread.pages)).toEqual([3])
    expect(spread.previousPage).toBe(2)
    expect(spread.nextPage).toBe(4)
  })

  it('세로 페이지를 파일 처음부터 두 장씩 묶고 오른쪽 페이지 선택을 유지한다', () => {
    const pages = Array.from({ length: 6 }, (_, index) => createPage(index + 1))

    const leftSelected = calculatePageSpread(pages, 3, 'spread', true)
    const rightSelected = calculatePageSpread(pages, 4, 'spread', true)

    expect(getPageNumbers(leftSelected.pages)).toEqual([3, 4])
    expect(getPageNumbers(rightSelected.pages)).toEqual([3, 4])
    expect(rightSelected.previousPage).toBe(1)
    expect(rightSelected.nextPage).toBe(5)
  })

  it('가로 페이지를 건너뛰지 않고 혼합 문서를 순서대로 묶는다', () => {
    const pages = [
      createPage(1),
      createPage(2),
      createPage(3, 900, 600),
      createPage(4),
      createPage(5),
    ]

    const spreads = [1, 3, 5].map((currentPage) =>
      calculatePageSpread(pages, currentPage, 'spread', true),
    )

    expect(spreads.map(({ pages: visiblePages }) => getPageNumbers(visiblePages))).toEqual([
      [1, 2],
      [3],
      [4, 5],
    ])
    expect(spreads.map(({ previousPage, nextPage }) => [previousPage, nextPage])).toEqual([
      [null, 3],
      [1, 4],
      [3, null],
    ])
  })

  it('세로 페이지 사이의 가로 페이지와 홀로 남은 마지막 페이지를 단독 표시한다', () => {
    const separatedPages = [createPage(1), createPage(2, 900, 600), createPage(3)]
    const oddPortraitPages = Array.from({ length: 5 }, (_, index) => createPage(index + 1))

    expect(getPageNumbers(calculatePageSpread(separatedPages, 1, 'spread', true).pages)).toEqual([
      1,
    ])
    expect(getPageNumbers(calculatePageSpread(separatedPages, 3, 'spread', true).pages)).toEqual([
      3,
    ])

    const lastSpread = calculatePageSpread(oddPortraitPages, 5, 'spread', true)
    expect(getPageNumbers(lastSpread.pages)).toEqual([5])
    expect(lastSpread.previousPage).toBe(3)
    expect(lastSpread.nextPage).toBeNull()
  })

  it('공간이 부족하면 현재 페이지만 표시하고 넓어지면 보기 선호를 복원한다', () => {
    const pages = [createPage(1), createPage(2)]

    const restricted = calculatePageSpread(pages, 2, 'spread', false)
    const restored = calculatePageSpread(pages, 2, 'spread', true)

    expect(getPageNumbers(restricted.pages)).toEqual([2])
    expect(getPageNumbers(restored.pages)).toEqual([1, 2])
  })
})
