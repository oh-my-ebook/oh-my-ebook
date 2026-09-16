import { createElement, useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReaderLayout, type ReaderLayout } from './use-reader-layout'

const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

// 전역 mutable 변수를 모듈 최상단에 두고 beforeEach로 초기화하면, 초기화를 하나 빠뜨렸을 때
// 테스트 간 상태가 새는 문제를 찾기 어렵다. 각 테스트가 필요한 mock을 직접 만들어 쓰도록
// 팩토리 함수로 감싼다. 두 mock은 서로 무관한 브라우저 API라 하나로 합치지 않는다.
function setupResizeObserverMock() {
  let resizeCallback: ResizeObserverCallback | null = null
  const observeResizeTarget = vi.fn()
  const disconnectResizeObserver = vi.fn()

  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback
    }

    observe = observeResizeTarget
    unobserve = vi.fn()
    disconnect = disconnectResizeObserver
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)

  return {
    observeResizeTarget,
    disconnectResizeObserver,
    triggerResize() {
      if (!resizeCallback) {
        throw new Error('ResizeObserver가 아직 관찰을 시작하지 않았습니다.')
      }
      const callback = resizeCallback
      act(() => {
        callback([], {} as ResizeObserver)
      })
    },
  }
}

function setupMatchMediaMock(initialMatches = false) {
  let matches = initialMatches
  let changeListeners: Array<(event: MediaQueryListEvent) => void> = []
  const removeMediaChangeListener = vi.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      changeListeners = changeListeners.filter((registered) => registered !== listener)
    },
  )

  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      changeListeners.push(listener)
    },
    removeEventListener: removeMediaChangeListener,
  }))

  vi.stubGlobal('matchMedia', matchMedia)

  return {
    matchMedia,
    removeMediaChangeListener,
    triggerMediaChange(nextMatches: boolean) {
      matches = nextMatches
      act(() => {
        for (const listener of changeListeners) {
          listener({ matches: nextMatches } as MediaQueryListEvent)
        }
      })
    },
  }
}

// containerRef가 일반 useRef라 실제로 렌더링된 DOM 노드가 있어야 측정할 수 있다. 훅의 최신
// 반환값도 모듈 변수 대신 렌더링마다 새로 만드는 캡처 객체에 담아 테스트마다 독립적으로 둔다.
function LayoutHarness({ onLayout }: { onLayout: (layout: ReaderLayout) => void }) {
  const layout = useReaderLayout()
  useEffect(() => {
    onLayout(layout)
  })
  return createElement('div', { ref: layout.containerRef })
}

function renderLayoutHarness() {
  const capture: { current: ReaderLayout | null } = { current: null }
  const view = render(
    createElement(LayoutHarness, {
      onLayout: (layout: ReaderLayout) => {
        capture.current = layout
      },
    }),
  )

  if (!capture.current) {
    throw new Error('레이아웃 훅이 아직 초기화되지 않았습니다.')
  }

  return { layout: capture, unmount: view.unmount }
}

function setContainerSize(container: HTMLElement, width: number, height: number) {
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
}

describe('useReaderLayout', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('컨테이너가 연결되면 여백을 제외한 크기를 측정한다', () => {
    const resizeObserver = setupResizeObserverMock()
    setupMatchMediaMock()
    const { layout } = renderLayoutHarness()
    const container = layout.current!.containerRef.current!
    container.style.paddingLeft = '24px'
    container.style.paddingRight = '24px'
    container.style.paddingTop = '24px'
    container.style.paddingBottom = '24px'

    setContainerSize(container, 1048, 1248)
    resizeObserver.triggerResize()

    expect(layout.current?.availableWidth).toBe(1000)
    expect(layout.current?.availableHeight).toBe(1200)
    expect(resizeObserver.observeResizeTarget).toHaveBeenCalledWith(container)
  })

  it('읽기 영역 가용 폭 999px과 1000px 경계를 정확히 구분한다', () => {
    const resizeObserver = setupResizeObserverMock()
    setupMatchMediaMock()
    const { layout } = renderLayoutHarness()
    const container = layout.current!.containerRef.current!

    setContainerSize(container, 999, 800)
    resizeObserver.triggerResize()
    expect(layout.current?.availableWidth).toBe(999)

    setContainerSize(container, 1000, 800)
    resizeObserver.triggerResize()
    expect(layout.current?.availableWidth).toBe(1000)
  })

  it('읽기 영역 크기가 바뀌면 다시 측정한다', () => {
    const resizeObserver = setupResizeObserverMock()
    setupMatchMediaMock()
    const { layout } = renderLayoutHarness()
    const container = layout.current!.containerRef.current!

    setContainerSize(container, 800, 600)
    resizeObserver.triggerResize()
    expect(layout.current?.availableWidth).toBe(800)

    setContainerSize(container, 1200, 900)
    resizeObserver.triggerResize()

    expect(layout.current?.availableWidth).toBe(1200)
    expect(layout.current?.availableHeight).toBe(900)
  })

  it('해제되면 크기 관찰을 정리한다', () => {
    const resizeObserver = setupResizeObserverMock()
    setupMatchMediaMock()
    const { unmount } = renderLayoutHarness()
    expect(resizeObserver.disconnectResizeObserver).not.toHaveBeenCalled()

    unmount()

    expect(resizeObserver.disconnectResizeObserver).toHaveBeenCalledOnce()
  })

  it('화면 폭 1024px 이상일 때만 넓은 화면으로 판단한다', () => {
    setupResizeObserverMock()
    setupMatchMediaMock(false)
    const narrow = renderLayoutHarness()
    expect(narrow.layout.current?.isWideScreen).toBe(false)
    narrow.unmount()

    setupMatchMediaMock(true)
    const wide = renderLayoutHarness()
    expect(wide.layout.current?.isWideScreen).toBe(true)
  })

  it('화면 폭 경계를 (min-width: 1024px) 미디어 쿼리로 판단한다', () => {
    setupResizeObserverMock()
    const matchMediaMock = setupMatchMediaMock()
    renderLayoutHarness()

    expect(matchMediaMock.matchMedia).toHaveBeenCalledWith(WIDE_SCREEN_QUERY)
  })

  it('화면 폭이 경계를 넘나들면 넓은 화면 상태를 갱신한다', () => {
    setupResizeObserverMock()
    const matchMediaMock = setupMatchMediaMock(false)
    const { layout } = renderLayoutHarness()
    expect(layout.current?.isWideScreen).toBe(false)

    matchMediaMock.triggerMediaChange(true)
    expect(layout.current?.isWideScreen).toBe(true)

    matchMediaMock.triggerMediaChange(false)
    expect(layout.current?.isWideScreen).toBe(false)
  })

  it('해제되면 화면 폭 변경 관찰도 정리한다', () => {
    setupResizeObserverMock()
    const matchMediaMock = setupMatchMediaMock()
    const { unmount } = renderLayoutHarness()

    unmount()

    expect(matchMediaMock.removeMediaChangeListener).toHaveBeenCalledOnce()
  })
})
