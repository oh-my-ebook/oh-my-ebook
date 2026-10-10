import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestRouter } from '@/test/test-router'
import { LandingPage } from './landing-page'

function setupResizeObserver() {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LandingPage', () => {
  it('책장을 연결하고 표지를 앞뒤로 전환한다', async () => {
    setupResizeObserver()
    const user = userEvent.setup()
    render(<LandingPage />, { wrapper: TestRouter })

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
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<LandingPage />, { wrapper: TestRouter })
    const demo = screen.getByRole('region', { name: '읽기 체험' })
    expect(within(demo).getByText(/미리 작성한 답변/)).toBeInTheDocument()
    await user.click(within(demo).getByRole('button', { name: '이 페이지 요약' }))
    expect(within(demo).getByText('이 페이지에 대해 요약해줘')).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    const log = within(demo).getByRole('log')
    await waitFor(() => expect(log).toHaveTextContent('직접 관리할 필요가 없습니다.'))
    await user.type(within(demo).getByRole('textbox', { name: '질문 입력' }), '다른 질문')
    await user.click(within(demo).getByRole('button', { name: '질문 보내기' }))
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    expect(await within(demo).findByText(/자유로운 질문은 실제 PDF 리더/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /실제 PDF 리더 열기/ })).toHaveAttribute(
      'href',
      '/sample-reader',
    )
  })
})
