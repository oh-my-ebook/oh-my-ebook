import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FullscreenToggle } from './fullscreen-toggle'

// jsdom에는 Fullscreen API가 없어 테스트마다 새 상태를 가진 가짜 API를 붙이고 끝나면 지운다.
function setupFullscreenMock({ enabled = true } = {}) {
  let fullscreenElement: Element | null = null
  const notifyChange = () => document.dispatchEvent(new Event('fullscreenchange'))
  const requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement
    notifyChange()
  })
  const exitFullscreen = vi.fn(async () => {
    fullscreenElement = null
    notifyChange()
  })

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled })
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  })
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  })

  return {
    requestFullscreen,
    exitFullscreen,
    // Esc처럼 앱 밖에서 전체 화면이 끝난 상황
    endFromBrowser: () => {
      fullscreenElement = null
      notifyChange()
    },
  }
}

describe('FullscreenToggle', () => {
  afterEach(() => {
    for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen'] as const) {
      Reflect.deleteProperty(document, key)
    }
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
  })

  it('전체 화면을 지원하지 않으면 버튼을 표시하지 않는다', () => {
    setupFullscreenMock({ enabled: false })
    render(<FullscreenToggle />)

    expect(screen.queryByRole('button', { name: '전체 화면' })).not.toBeInTheDocument()
  })

  it('누르면 전체 화면을 켜고, 다시 누르면 끈다', async () => {
    const user = userEvent.setup()
    const fullscreen = setupFullscreenMock()
    render(<FullscreenToggle />)

    await user.click(screen.getByRole('button', { name: '전체 화면' }))

    expect(fullscreen.requestFullscreen).toHaveBeenCalledOnce()
    const exitButton = screen.getByRole('button', { name: '전체 화면 종료' })
    expect(exitButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(exitButton)

    expect(fullscreen.exitFullscreen).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '전체 화면' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('Esc 등 브라우저에서 전체 화면을 끝내도 버튼 상태가 따라간다', async () => {
    const user = userEvent.setup()
    const fullscreen = setupFullscreenMock()
    render(<FullscreenToggle />)
    await user.click(screen.getByRole('button', { name: '전체 화면' }))

    act(() => fullscreen.endFromBrowser())

    expect(screen.getByRole('button', { name: '전체 화면' })).toBeInTheDocument()
  })
})
