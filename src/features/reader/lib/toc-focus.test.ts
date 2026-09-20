import { describe, expect, it, vi } from 'vitest'
import { focusTocPageThumbnail } from './toc-focus'

function createContainerWithRow(pageNumber: number) {
  const container = document.createElement('div')
  const row = document.createElement('button')
  row.setAttribute('data-page-number', String(pageNumber))
  container.append(row)
  return { container, row }
}

describe('focusTocPageThumbnail', () => {
  it('해당 페이지 번호의 썸네일에 스크롤 없이 포커스를 옮긴다', () => {
    const { container, row } = createContainerWithRow(3)
    const focus = vi.spyOn(row, 'focus')

    focusTocPageThumbnail(container, 3)

    // scrollIntoView는 TocPageThumbnail 자체 효과가 이미 담당하므로, 브라우저 기본 포커스
    // 스크롤과 겹쳐 스크롤이 엉뚱하게 튀지 않도록 preventScroll을 반드시 지정해야 한다.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('해당 페이지 번호의 썸네일이 없으면 아무 일도 하지 않는다', () => {
    const { container } = createContainerWithRow(3)

    expect(() => focusTocPageThumbnail(container, 99)).not.toThrow()
  })
})
