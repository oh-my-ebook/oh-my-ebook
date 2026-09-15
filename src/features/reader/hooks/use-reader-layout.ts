import { useEffect, useRef, useState, type RefObject } from 'react'

export interface ReaderLayout {
  availableWidth: number
  containerRef: RefObject<HTMLDivElement | null>
}

function measureAvailableWidth(container: HTMLElement) {
  const style = getComputedStyle(container)
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)

  return Math.max(0, container.clientWidth - horizontalPadding)
}

export function useReaderLayout(): ReaderLayout {
  const containerRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver(() => {
      setAvailableWidth(measureAvailableWidth(container))
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  return { availableWidth, containerRef }
}
