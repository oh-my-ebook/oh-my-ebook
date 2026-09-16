import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PageNavigator } from './page-navigator'

function PageNavigatorHarness({ initialPage = 1, totalPages = 5 }) {
  const [currentPage, setCurrentPage] = useState(initialPage)
  return (
    <PageNavigator
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      totalPages={totalPages}
    />
  )
}

function getSliderControl() {
  const slider = screen.getByLabelText('페이지 슬라이더')
  const control = slider.parentElement?.parentElement
  if (!(control instanceof HTMLDivElement)) {
    throw new Error('Slider 조작 영역을 찾지 못했습니다.')
  }

  control.getBoundingClientRect = () => ({
    bottom: 10,
    height: 10,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  })
  return control
}

describe('PageNavigator', () => {
  it('서로 다른 아이콘으로 첫·이전·다음·마지막 페이지 이동을 요청한다', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<PageNavigator currentPage={3} onPageChange={onPageChange} totalPages={5} />)

    const firstButton = screen.getByRole('button', { name: '첫 페이지' })
    const previousButton = screen.getByRole('button', { name: '이전 페이지' })
    const nextButton = screen.getByRole('button', { name: '다음 페이지' })
    const lastButton = screen.getByRole('button', { name: '마지막 페이지' })

    expect(firstButton.querySelector('svg')).toHaveClass('lucide-chevrons-left')
    expect(previousButton.querySelector('svg')).toHaveClass('lucide-chevron-left')
    expect(nextButton.querySelector('svg')).toHaveClass('lucide-chevron-right')
    expect(lastButton.querySelector('svg')).toHaveClass('lucide-chevrons-right')

    await user.click(firstButton)
    await user.click(previousButton)
    await user.click(nextButton)
    await user.click(lastButton)

    expect(onPageChange.mock.calls).toEqual([[1], [2], [4], [5]])
  })

  it('현재 페이지와 전체 페이지 수를 수정할 수 없는 텍스트로 표시한다', () => {
    render(<PageNavigator currentPage={3} onPageChange={vi.fn()} totalPages={5} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('3 / 5')
  })

  it('슬라이더의 range와 thumb에 이동 transition 스타일을 연결한다', () => {
    render(<PageNavigator currentPage={3} onPageChange={vi.fn()} totalPages={5} />)

    expect(screen.getByLabelText('페이지 슬라이더').closest('[data-slot="slider"]')).toHaveClass(
      'reader-slider',
    )
  })

  it('첫 페이지와 마지막 페이지에서 해당 방향 이동을 비활성화한다', () => {
    const { rerender } = render(
      <PageNavigator currentPage={1} onPageChange={vi.fn()} totalPages={5} />,
    )

    expect(screen.getByRole('button', { name: '첫 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '마지막 페이지' })).toBeEnabled()

    rerender(<PageNavigator currentPage={5} onPageChange={vi.fn()} totalPages={5} />)
    expect(screen.getByRole('button', { name: '첫 페이지' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '마지막 페이지' })).toBeDisabled()
  })

  it('한 장 문서와 사용할 수 없는 상태에서는 모든 이동을 비활성화한다', () => {
    const { rerender } = render(
      <PageNavigator currentPage={1} onPageChange={vi.fn()} totalPages={1} />,
    )

    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('1 / 1')
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByLabelText('페이지 슬라이더')).toBeDisabled()

    rerender(<PageNavigator currentPage={2} disabled onPageChange={vi.fn()} totalPages={5} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByLabelText('페이지 슬라이더')).toBeDisabled()
  })

  it('슬라이더를 키보드로 페이지 단위 이동하고 페이지 텍스트를 동기화한다', async () => {
    const user = userEvent.setup()
    render(<PageNavigatorHarness initialPage={2} />)
    const slider = screen.getByLabelText('페이지 슬라이더')

    slider.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')

    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('4 / 5')
    expect(slider).toHaveAttribute('aria-valuenow', '4')
  })

  it('슬라이더를 마우스로 드래그해 페이지를 이동한다', () => {
    const onPageChange = vi.fn()
    render(<PageNavigator currentPage={1} onPageChange={onPageChange} totalPages={5} />)
    const control = getSliderControl()

    fireEvent(control, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100 }))
    fireEvent(document, new MouseEvent('pointermove', { bubbles: true, buttons: 1, clientX: 300 }))

    expect(screen.getByRole('status', { name: '페이지 위치' })).toHaveTextContent('4 / 5')
    expect(onPageChange).not.toHaveBeenCalled()

    fireEvent(document, new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 300 }))

    expect(onPageChange).toHaveBeenCalledOnce()
    expect(onPageChange).toHaveBeenCalledWith(4)
  })
})
