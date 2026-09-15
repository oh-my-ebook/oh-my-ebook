import { useCallback, useEffect, useState } from 'react'

const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

export interface ReaderLayout {
  availableHeight: number
  availableWidth: number
  isWideScreen: boolean
  containerRef: (node: HTMLDivElement | null) => void
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
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [availableSize, setAvailableSize] = useState<AvailableReaderSize>(emptyReaderSize)
  const [isWideScreen, setIsWideScreen] = useState(
    () => window.matchMedia(WIDE_SCREEN_QUERY).matches,
  )

  // 컨테이너 DOM 요소가 바뀌었다는 사실 자체로 관찰을 다시 시작해야 하므로 callback ref로 상태에 반영한다.
  // 최초 측정도 컨테이너가 정해지는 이 시점에 함께 처리해 effect 본문에서 setState를 호출하지 않는다.
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node)
    setAvailableSize(node ? measureAvailableReaderSize(node) : emptyReaderSize)
  }, [])

  useEffect(() => {
    if (!container) {
      return
    }

    const observer = new ResizeObserver(() => {
      setAvailableSize(measureAvailableReaderSize(container))
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [container])

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

  return { ...availableSize, isWideScreen, containerRef }
}
