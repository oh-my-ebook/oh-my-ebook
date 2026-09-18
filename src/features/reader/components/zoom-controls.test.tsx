import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ZoomControls } from './zoom-controls'

function renderZoomControls(overrides: Partial<Parameters<typeof ZoomControls>[0]> = {}) {
  const props = {
    isFitHeight: true,
    scale: 0.75,
    canZoomIn: true,
    canZoomOut: true,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFitHeight: vi.fn(),
    ...overrides,
  }

  render(<ZoomControls {...props} />)
  return props
}

describe('ZoomControls', () => {
  it('확대·축소·현재 확대율·높이 맞춤을 표시하고 조작한다', async () => {
    const user = userEvent.setup()
    const props = renderZoomControls()

    expect(screen.getByRole('group', { name: '크기 조절' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '현재 확대율' })).toHaveTextContent('75%')
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: '축소' }))
    await user.click(screen.getByRole('button', { name: '확대' }))
    await user.click(screen.getByRole('button', { name: '높이 맞춤' }))

    expect(props.onZoomOut).toHaveBeenCalledOnce()
    expect(props.onZoomIn).toHaveBeenCalledOnce()
    expect(props.onFitHeight).toHaveBeenCalledOnce()
  })

  it('버튼을 키보드로 차례대로 조작한다', async () => {
    const user = userEvent.setup()
    const props = renderZoomControls({ isFitHeight: false, scale: 1 })

    await user.tab()
    expect(screen.getByRole('button', { name: '축소' })).toHaveFocus()
    await user.keyboard('{Enter}')

    await user.tab()
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toHaveFocus()
    await user.keyboard('{Enter}')

    await user.tab()
    expect(screen.getByRole('button', { name: '확대' })).toHaveFocus()
    await user.keyboard(' ')

    expect(props.onZoomOut).toHaveBeenCalledOnce()
    expect(props.onZoomIn).toHaveBeenCalledOnce()
    expect(props.onFitHeight).toHaveBeenCalledOnce()
  })

  it('수동 배율 한계에 도달한 방향의 조작을 비활성화한다', () => {
    renderZoomControls({ canZoomIn: false, canZoomOut: false })

    expect(screen.getByRole('button', { name: '축소' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '확대' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toBeEnabled()
  })

  it('크기 조절을 사용할 수 없으면 모든 조작을 비활성화한다', () => {
    renderZoomControls({ disabled: true })

    expect(screen.getByRole('button', { name: '축소' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '확대' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toBeDisabled()
  })

  it('좁은 화면에서 조작부가 겹치지 않도록 줄바꿈할 수 있다', () => {
    renderZoomControls()

    expect(screen.getByRole('group', { name: '크기 조절' })).toHaveClass('flex-wrap')
  })
})
