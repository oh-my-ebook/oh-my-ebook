import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

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
  const { height, width } = container.getBoundingClientRect()
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)

  return {
    availableHeight: Math.max(0, height - verticalPadding),
    availableWidth: Math.max(0, width - horizontalPadding),
  }
}

export function useReaderLayout(): ReaderLayout {
  const containerRef = useRef<HTMLElement | null>(null)
  const [availableSize, setAvailableSize] = useState<AvailableReaderSize>(emptyReaderSize)
  const [isWideScreen, setIsWideScreen] = useState(
    () => window.matchMedia(WIDE_SCREEN_QUERY).matches,
  )
  // 패널을 여닫을 때 보기 방식이 바뀌지 않도록 읽기 영역이 아닌 브라우저 창 너비로만 판단한다.
  // 좁아진 읽기 영역에서는 높이 맞춤이 두 페이지를 너비에 맞게 축소한다.
  const isSpreadAvailable = isWideScreen

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
