import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ViewModeControl } from './view-mode-control'

describe('ViewModeControl', () => {
  it('선택한 보기 방식을 표시하고 변경을 요청한다', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    const { rerender } = render(
      <ViewModeControl isSpreadAvailable onViewChange={onViewChange} preferredView="single" />,
    )

    expect(screen.getByRole('group', { name: '보기 방식' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '한 페이지' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '두 페이지' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(screen.getByRole('button', { name: '두 페이지' }))

    expect(onViewChange).toHaveBeenCalledWith('spread')

    rerender(
      <ViewModeControl isSpreadAvailable onViewChange={onViewChange} preferredView="spread" />,
    )
    expect(screen.getByRole('button', { name: '두 페이지' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('선택된 항목을 다시 눌러 빈 배열이 전달되어도 보기 선호를 유지한다', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    render(<ViewModeControl isSpreadAvailable onViewChange={onViewChange} preferredView="single" />)

    await user.click(screen.getByRole('button', { name: '한 페이지' }))

    expect(onViewChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '한 페이지' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('두 페이지 보기를 적용할 수 없으면 선택을 보존하고 제한 사유를 안내한다', () => {
    render(
      <ViewModeControl isSpreadAvailable={false} onViewChange={vi.fn()} preferredView="spread" />,
    )

    const spreadButton = screen.getByRole('button', { name: '두 페이지' })
    const restriction = screen.getByText(
      '두 페이지 보기는 화면 폭 1024px 이상, 읽기 영역 1000px 이상에서 사용할 수 있습니다.',
    )

    expect(spreadButton).toBeDisabled()
    expect(spreadButton).toHaveAttribute('aria-pressed', 'true')
    expect(spreadButton).toHaveAttribute('aria-describedby', restriction.id)
    expect(restriction).toBeVisible()
  })

  it('키보드로 항목을 탐색하고 보기 방식을 변경한다', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    render(<ViewModeControl isSpreadAvailable onViewChange={onViewChange} preferredView="single" />)

    const singleButton = screen.getByRole('button', { name: '한 페이지' })
    const spreadButton = screen.getByRole('button', { name: '두 페이지' })

    await user.tab()
    expect(singleButton).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(spreadButton).toHaveFocus()

    await user.keyboard(' ')
    expect(onViewChange).toHaveBeenCalledWith('spread')
  })
})
