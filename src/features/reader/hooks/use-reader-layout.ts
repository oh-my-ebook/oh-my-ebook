import { useEffect, useRef, useState, type RefObject } from 'react'

export interface ReaderLayout {
  availableHeight: number
  availableWidth: number
  containerRef: RefObject<HTMLDivElement | null>
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [availableSize, setAvailableSize] = useState<AvailableReaderSize>(emptyReaderSize)

  useEffect(() => {
    const container = containerRef.current
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
  }, [])

  return { ...availableSize, containerRef }
}
