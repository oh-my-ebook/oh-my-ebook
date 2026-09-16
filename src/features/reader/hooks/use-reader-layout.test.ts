import { createElement, useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReaderLayout, type ReaderLayout } from './use-reader-layout'

const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

let resizeObserveCallback: ResizeObserverCallback | null = null
const disconnectResizeObserver = vi.fn()
const observeResizeTarget = vi.fn()

let mediaQueryMatches = false
let mediaChangeListeners: Array<(event: MediaQueryListEvent) => void> = []
const removeMediaChangeListener = vi.fn(
  (_type: string, listener: (event: MediaQueryListEvent) => void) => {
    mediaChangeListeners = mediaChangeListeners.filter((registered) => registered !== listener)
  },
)

function stubResizeObserver() {
  class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
      resizeObserveCallback = callback
    }

    observe = observeResizeTarget
    unobserve = vi.fn()
    disconnect = disconnectResizeObserver
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

function stubMatchMedia() {
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return mediaQueryMatches
    },
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaChangeListeners.push(listener)
    },
    removeEventListener: removeMediaChangeListener,
  }))

  vi.stubGlobal('matchMedia', matchMedia)
  return matchMedia
}

function triggerMediaChange(matches: boolean) {
  mediaQueryMatches = matches
  act(() => {
    for (const listener of mediaChangeListeners) {
      listener({ matches } as MediaQueryListEvent)
    }
  })
}

function triggerResize() {
  if (!resizeObserveCallback) {
    throw new Error('ResizeObserver가 아직 관찰을 시작하지 않았습니다.')
  }
  const callback = resizeObserveCallback
  act(() => {
    callback([], {} as ResizeObserver)
  })
}

// containerRef가 일반 useRef로 바뀌어 실제로 렌더링된 DOM 노드가 있어야 측정할 수 있으므로,
// renderHook 대신 컨테이너 하나를 렌더링하는 최소 컴포넌트로 확인한다. JSX 없이 createElement를 사용해
// 파일 확장자를 tasks.md가 지정한 `.test.ts`로 유지한다.
let latestLayout: ReaderLayout | null = null

function LayoutHarness() {
  const layout = useReaderLayout()
  // 렌더 중 바깥 변수를 직접 대입하지 않고, 커밋 이후 effect에서 최신 값을 기록한다.
  useEffect(() => {
    latestLayout = layout
  })
  return createElement('div', { ref: layout.containerRef })
}

function renderLayoutHarness() {
  render(createElement(LayoutHarness))
  if (!latestLayout) {
    throw new Error('레이아웃 훅이 아직 초기화되지 않았습니다.')
  }
  return latestLayout
}

function getContainer() {
  const container = latestLayout?.containerRef.current
  if (!container) {
    throw new Error('컨테이너가 아직 연결되지 않았습니다.')
  }
  return container
}

function setContainerSize(width: number, height: number) {
  const container = getContainer()
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
}

describe('useReaderLayout', () => {
  beforeEach(() => {
    latestLayout = null
    resizeObserveCallback = null
    observeResizeTarget.mockReset()
    disconnectResizeObserver.mockReset()
    mediaChangeListeners = []
    removeMediaChangeListener.mockReset()
    mediaQueryMatches = false
    stubResizeObserver()
    stubMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('컨테이너가 연결되면 여백을 제외한 크기를 측정한다', () => {
    renderLayoutHarness()
    const container = getContainer()
    container.style.paddingLeft = '24px'
    container.style.paddingRight = '24px'
    container.style.paddingTop = '24px'
    container.style.paddingBottom = '24px'

    setContainerSize(1048, 1248)
    triggerResize()

    expect(latestLayout?.availableWidth).toBe(1000)
    expect(latestLayout?.availableHeight).toBe(1200)
    expect(observeResizeTarget).toHaveBeenCalledWith(container)
  })

  it('읽기 영역 가용 폭 999px과 1000px 경계를 정확히 구분한다', () => {
    renderLayoutHarness()

    setContainerSize(999, 800)
    triggerResize()
    expect(latestLayout?.availableWidth).toBe(999)

    setContainerSize(1000, 800)
    triggerResize()
    expect(latestLayout?.availableWidth).toBe(1000)
  })

  it('읽기 영역 크기가 바뀌면 다시 측정한다', () => {
    renderLayoutHarness()
    setContainerSize(800, 600)
    triggerResize()
    expect(latestLayout?.availableWidth).toBe(800)

    setContainerSize(1200, 900)
    triggerResize()

    expect(latestLayout?.availableWidth).toBe(1200)
    expect(latestLayout?.availableHeight).toBe(900)
  })

  it('해제되면 크기 관찰을 정리한다', () => {
    const { unmount } = render(createElement(LayoutHarness))
    expect(disconnectResizeObserver).not.toHaveBeenCalled()

    unmount()

    expect(disconnectResizeObserver).toHaveBeenCalledOnce()
  })

  it('화면 폭 1024px 이상일 때만 넓은 화면으로 판단한다', () => {
    mediaQueryMatches = false
    const narrowLayout = renderLayoutHarness()
    expect(narrowLayout.isWideScreen).toBe(false)

    mediaQueryMatches = true
    const wideLayout = renderLayoutHarness()
    expect(wideLayout.isWideScreen).toBe(true)
  })

  it('화면 폭 경계를 (min-width: 1024px) 미디어 쿼리로 판단한다', () => {
    const matchMedia = stubMatchMedia()
    renderLayoutHarness()

    expect(matchMedia).toHaveBeenCalledWith(WIDE_SCREEN_QUERY)
  })

  it('화면 폭이 경계를 넘나들면 넓은 화면 상태를 갱신한다', () => {
    mediaQueryMatches = false
    renderLayoutHarness()
    expect(latestLayout?.isWideScreen).toBe(false)

    triggerMediaChange(true)
    expect(latestLayout?.isWideScreen).toBe(true)

    triggerMediaChange(false)
    expect(latestLayout?.isWideScreen).toBe(false)
  })

  it('해제되면 화면 폭 변경 관찰도 정리한다', () => {
    const { unmount } = render(createElement(LayoutHarness))

    unmount()

    expect(removeMediaChangeListener).toHaveBeenCalledOnce()
  })
})
