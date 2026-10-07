import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from './landing-page'

function setupResizeObserver() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

afterEach(() => vi.unstubAllGlobals())

describe('LandingPage', () => {
  it('책장을 연결하고 표지를 앞뒤로 전환한다', async () => {
    setupResizeObserver()
    const user = userEvent.setup()
    render(<LandingPage />, { wrapper: MemoryRouter })

    expect(screen.getByRole('link', { name: '내 PDF로 시작하기' })).toHaveAttribute(
      'href',
      '/library',
    )
    const carousel = screen.getByRole('region', { name: '직접 만든 책 표지' })
    expect(within(carousel).getByRole('status')).toHaveTextContent('운영체제의 기초')
    await user.click(within(carousel).getByRole('button', { name: '다음 책' }))
    expect(within(carousel).getByRole('status')).toHaveTextContent('그림으로 배우는 자료구조')
    await user.click(within(carousel).getByRole('button', { name: '이전 책' }))
    expect(within(carousel).getByRole('status')).toHaveTextContent('운영체제의 기초')
  })

  it('실제 채팅처럼 요약 질문을 보내고 자유 질문에는 체험 범위를 안내한다', async () => {
    setupResizeObserver()
    const user = userEvent.setup()
    render(<LandingPage />, { wrapper: MemoryRouter })
    const demo = screen.getByRole('region', { name: '읽기 체험' })
    expect(within(demo).getByText(/미리 작성한 답변/)).toBeInTheDocument()
    expect(within(demo).queryByRole('button', { name: '문장 선택해 보기' })).not.toBeInTheDocument()
    expect(within(demo).queryByRole('tab')).not.toBeInTheDocument()
    await user.click(within(demo).getByRole('button', { name: '이 페이지 요약' }))
    expect(await within(demo).findByText('이 페이지에 대해 요약해줘')).toBeInTheDocument()
    expect(await within(demo).findByText(/페이지 테이블이 두 주소를 연결/)).toBeInTheDocument()
    await user.type(within(demo).getByRole('textbox', { name: '질문 입력' }), '다른 질문')
    await user.click(within(demo).getByRole('button', { name: '질문 보내기' }))
    expect(await within(demo).findByText(/자유로운 질문은 실제 PDF 리더/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /실제 PDF 리더 열기/ })).toHaveAttribute(
      'href',
      '/sample-reader',
    )
  })
})
