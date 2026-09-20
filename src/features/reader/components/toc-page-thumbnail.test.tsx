import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { TocPageThumbnail } from './toc-page-thumbnail'

const { isRenderablePdfPage, renderPdfPageToCanvas } = vi.hoisted(() => ({
  isRenderablePdfPage: vi.fn(() => true),
  renderPdfPageToCanvas: vi.fn(() => Promise.resolve()),
}))

vi.mock('../lib/pdf-page-render', () => ({ isRenderablePdfPage, renderPdfPageToCanvas }))

// jsdom에는 IntersectionObserver가 없으므로, 테스트마다 새 인스턴스 목록을 담는 stub을 만들어
// 관찰 콜백을 직접 호출해 "화면에 보임"을 흉내 낸다.
function createIntersectionObserverStub() {
  const instances: { callback: IntersectionObserverCallback; observe: ReturnType<typeof vi.fn> }[] =
    []

  class IntersectionObserverStub {
    callback: IntersectionObserverCallback
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      instances.push(this)
    }
  }

  return { instances, IntersectionObserverStub }
}

function notifyIntersecting(
  instances: { callback: IntersectionObserverCallback }[],
  isIntersecting: boolean,
) {
  const [instance] = instances
  if (!instance) {
    throw new Error('IntersectionObserver가 아직 생성되지 않았습니다.')
  }
  instance.callback(
    [{ isIntersecting } as IntersectionObserverEntry],
    instance as unknown as IntersectionObserver,
  )
}

function createPage(pageNumber: number): PdfPageInfo {
  return { pageNumber, width: 800, height: 1200, rotation: 0 }
}

function createDocument(): PdfDocumentHandle {
  return {
    numPages: 1,
    getPage: vi.fn(async () => ({ getViewport: vi.fn() })),
  }
}

describe('TocPageThumbnail', () => {
  beforeEach(() => {
    isRenderablePdfPage.mockReturnValue(true)
    renderPdfPageToCanvas.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('페이지 번호를 항상 보여주고, 렌더링 전에는 스켈레톤을 보여준다', () => {
    const { IntersectionObserverStub } = createIntersectionObserverStub()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    const { container } = render(
      <TocPageThumbnail
        document={createDocument()}
        isCurrent={false}
        onSelect={vi.fn()}
        page={createPage(3)}
      />,
    )

    expect(screen.getByText('3페이지')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('화면에 보이면 페이지를 canvas에 그리고 스켈레톤을 감춘다', async () => {
    const { instances, IntersectionObserverStub } = createIntersectionObserverStub()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    const document = createDocument()
    const { container } = render(
      <TocPageThumbnail
        document={document}
        isCurrent={false}
        onSelect={vi.fn()}
        page={createPage(1)}
      />,
    )

    await act(async () => {
      notifyIntersecting(instances, true)
    })

    expect(document.getPage).toHaveBeenCalledWith(1)
    expect(renderPdfPageToCanvas).toHaveBeenCalledOnce()
    expect(screen.getByRole('img', { name: '1페이지 썸네일' })).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument()
  })

  it('클릭하면 onSelect에 페이지 번호를 전달한다', async () => {
    const user = userEvent.setup()
    const { IntersectionObserverStub } = createIntersectionObserverStub()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    const onSelect = vi.fn()
    render(
      <TocPageThumbnail
        document={createDocument()}
        isCurrent={false}
        onSelect={onSelect}
        page={createPage(5)}
      />,
    )

    await user.click(screen.getByRole('button', { name: '5페이지' }))

    expect(onSelect).toHaveBeenCalledWith(5)
  })

  it('현재 페이지면 aria-current로 표시한다', () => {
    const { IntersectionObserverStub } = createIntersectionObserverStub()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    render(
      <TocPageThumbnail
        document={createDocument()}
        isCurrent
        onSelect={vi.fn()}
        page={createPage(2)}
      />,
    )

    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
  })
})
