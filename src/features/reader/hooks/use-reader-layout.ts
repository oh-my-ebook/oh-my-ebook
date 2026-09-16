import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const WIDE_SCREEN_QUERY = '(min-width: 1024px)'
const MIN_SPREAD_WIDTH = 1000

export interface ReaderLayout {
  availableHeight: number
  availableWidth: number
  isWideScreen: boolean
  isSpreadAvailable: boolean
  containerRef: RefObject<HTMLElement | null>
}

interface AvailableReaderSize {
  availableHeight: number
  availableWidth: number
}

const emptyReaderSize: AvailableReaderSize = {
  availableHeight: 0,
  availableWidth: 0,
}

function measureAvailableReaderSize(container: HTMLElement): AvailableReaderSize {
  const style = getComputedStyle(container)
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)

  return {
    availableHeight: Math.max(0, container.clientHeight - verticalPadding),
    availableWidth: Math.max(0, container.clientWidth - horizontalPadding),
  }
}

export function useReaderLayout(): ReaderLayout {
  const containerRef = useRef<HTMLElement | null>(null)
  const [availableSize, setAvailableSize] = useState<AvailableReaderSize>(emptyReaderSize)
  const [isWideScreen, setIsWideScreen] = useState(
    () => window.matchMedia(WIDE_SCREEN_QUERY).matches,
  )
  const isSpreadAvailable = isWideScreen && availableSize.availableWidth >= MIN_SPREAD_WIDTH

  // 이 훅이 연결되는 컨테이너는 조건부로 사라지거나 다른 DOM 노드로 바뀌지 않으므로 일반 ref로 충분하다.
  // paint 전에 측정해 잘못된 크기가 잠깐이라도 그려지지 않도록 useLayoutEffect를 사용한다.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const measure = () => {
      setAvailableSize(measureAvailableReaderSize(container))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const mediaQueryList = window.matchMedia(WIDE_SCREEN_QUERY)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsWideScreen(event.matches)
    }

    mediaQueryList.addEventListener('change', handleChange)

    return () => {
      mediaQueryList.removeEventListener('change', handleChange)
    }
  }, [])

  return {
    ...availableSize,
    isWideScreen,
    isSpreadAvailable,
    containerRef,
  }
}
