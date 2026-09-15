import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReaderLayout } from './use-reader-layout'

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

function createContainer(width: number, height: number) {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height })
  document.body.append(container)
  return container
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

describe('useReaderLayout', () => {
  beforeEach(() => {
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
    document.body.replaceChildren()
  })

  it('컨테이너가 연결되면 여백을 제외한 크기를 최초 측정한다', () => {
    const { result } = renderHook(() => useReaderLayout())
    const container = createContainer(1048, 1248)
    container.style.paddingLeft = '24px'
    container.style.paddingRight = '24px'
    container.style.paddingTop = '24px'
    container.style.paddingBottom = '24px'

    act(() => {
      result.current.containerRef(container)
    })

    expect(result.current.availableWidth).toBe(1000)
    expect(result.current.availableHeight).toBe(1200)
    expect(observeResizeTarget).toHaveBeenCalledWith(container)
  })

  it('읽기 영역 가용 폭 999px과 1000px 경계를 정확히 구분한다', () => {
    const { result } = renderHook(() => useReaderLayout())

    const narrowContainer = createContainer(999, 800)
    act(() => {
      result.current.containerRef(narrowContainer)
    })
    expect(result.current.availableWidth).toBe(999)

    const wideContainer = createContainer(1000, 800)
    act(() => {
      result.current.containerRef(wideContainer)
    })
    expect(result.current.availableWidth).toBe(1000)
  })

  it('읽기 영역 크기가 바뀌면 다시 측정한다', () => {
    const { result } = renderHook(() => useReaderLayout())
    const container = createContainer(800, 600)

    act(() => {
      result.current.containerRef(container)
    })
    expect(result.current.availableWidth).toBe(800)

    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1200 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 900 })
    triggerResize()

    expect(result.current.availableWidth).toBe(1200)
    expect(result.current.availableHeight).toBe(900)
  })

  it('컨테이너가 바뀌거나 해제되면 이전 관찰을 정리한다', () => {
    const { result, unmount } = renderHook(() => useReaderLayout())
    const container = createContainer(800, 600)

    act(() => {
      result.current.containerRef(container)
    })
    expect(disconnectResizeObserver).not.toHaveBeenCalled()

    unmount()

    expect(disconnectResizeObserver).toHaveBeenCalledOnce()
  })

  it('화면 폭 1024px 이상일 때만 넓은 화면으로 판단한다', () => {
    mediaQueryMatches = false
    const { result: narrowResult } = renderHook(() => useReaderLayout())
    expect(narrowResult.current.isWideScreen).toBe(false)

    mediaQueryMatches = true
    const { result: wideResult } = renderHook(() => useReaderLayout())
    expect(wideResult.current.isWideScreen).toBe(true)
  })

  it('화면 폭 경계를 (min-width: 1024px) 미디어 쿼리로 판단한다', () => {
    const matchMedia = stubMatchMedia()
    renderHook(() => useReaderLayout())

    expect(matchMedia).toHaveBeenCalledWith(WIDE_SCREEN_QUERY)
  })

  it('화면 폭이 경계를 넘나들면 넓은 화면 상태를 갱신한다', () => {
    mediaQueryMatches = false
    const { result } = renderHook(() => useReaderLayout())
    expect(result.current.isWideScreen).toBe(false)

    triggerMediaChange(true)
    expect(result.current.isWideScreen).toBe(true)

    triggerMediaChange(false)
    expect(result.current.isWideScreen).toBe(false)
  })

  it('해제되면 화면 폭 변경 관찰도 정리한다', () => {
    const { unmount } = renderHook(() => useReaderLayout())

    unmount()

    expect(removeMediaChangeListener).toHaveBeenCalledOnce()
  })
})
