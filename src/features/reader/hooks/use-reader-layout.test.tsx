import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReaderLayout } from './use-reader-layout'

function TestReaderLayout() {
  const { availableWidth, containerRef } = useReaderLayout()

  return (
    <div
      data-testid="reader-container"
      ref={containerRef}
      style={{ paddingLeft: '24px', paddingRight: '16px' }}
    >
      <output aria-label="가용 폭">{availableWidth}</output>
    </div>
  )
}

describe('useReaderLayout', () => {
  const observe = vi.fn()
  const disconnect = vi.fn()
  let notifyResize: () => void

  beforeEach(() => {
    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this)
      }

      observe = observe
      unobserve = vi.fn()
      disconnect = disconnect
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('컨테이너 크기가 바뀌면 좌우 padding을 제외한 가용 폭을 갱신한다', () => {
    render(<TestReaderLayout />)
    const container = screen.getByTestId('reader-container')
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 640 })

    expect(observe).toHaveBeenCalledWith(container)

    act(notifyResize)
    expect(screen.getByRole('status', { name: '가용 폭' })).toHaveTextContent('600')

    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 520 })
    act(notifyResize)
    expect(screen.getByRole('status', { name: '가용 폭' })).toHaveTextContent('480')
  })

  it('unmount하면 컨테이너 관찰을 정리한다', () => {
    const { unmount } = render(<TestReaderLayout />)

    unmount()

    expect(disconnect).toHaveBeenCalledOnce()
  })
})
