import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { toast } from '@/components/ui/toast'

import { ViewModeControl } from './view-mode-control'

describe('ViewModeControl', () => {
  it('보기 방식을 아이콘으로 표시하고 Tooltip으로 설명한다', async () => {
    const user = userEvent.setup()
    render(<ViewModeControl isSpreadAvailable onViewChange={vi.fn()} preferredView="single" />)

    const singleButton = screen.getByRole('button', { name: '한 페이지' })
    const spreadButton = screen.getByRole('button', { name: '두 페이지' })

    expect(singleButton.querySelector('svg')).toBeInTheDocument()
    expect(spreadButton.querySelector('svg')).toBeInTheDocument()
    expect(singleButton).toHaveClass('cursor-pointer')
    expect(spreadButton).toHaveClass('cursor-pointer')
    expect(singleButton).not.toHaveTextContent('한 페이지')
    expect(spreadButton).not.toHaveTextContent('두 페이지')

    await user.hover(singleButton)

    expect(await screen.findByText('한 페이지')).toHaveAttribute('data-slot', 'tooltip-content')
  })

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
    expect(screen.getByRole('button', { name: '한 페이지' })).toHaveClass(
      'data-pressed:bg-primary',
      'data-pressed:text-primary-foreground',
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

  it('두 페이지 보기를 적용할 수 없으면 한 페이지 보기를 선택하고 버튼을 비활성화한다', () => {
    const { container } = render(
      <ViewModeControl isSpreadAvailable={false} onViewChange={vi.fn()} preferredView="spread" />,
    )

    const spreadButton = screen.getByRole('button', { name: '두 페이지' })

    expect(spreadButton).toBeDisabled()
    expect(screen.getByRole('button', { name: '한 페이지' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(spreadButton).toHaveAttribute('aria-pressed', 'false')
    expect(container).not.toHaveTextContent('두 페이지 보기는 화면 폭 1024px 이상')
  })

  it('두 페이지 보기 중 공간이 부족해지면 toast로 알린다', () => {
    const addToast = vi.spyOn(toast, 'add')
    const { rerender } = render(
      <ViewModeControl isSpreadAvailable onViewChange={vi.fn()} preferredView="spread" />,
    )

    expect(addToast).not.toHaveBeenCalled()

    rerender(
      <ViewModeControl isSpreadAvailable={false} onViewChange={vi.fn()} preferredView="spread" />,
    )

    expect(addToast).toHaveBeenCalledOnce()
    expect(addToast).toHaveBeenCalledWith({ title: '화면이 좁아 한 페이지로 표시합니다.' })
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
