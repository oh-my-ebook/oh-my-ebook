import { render, screen, within } from '@testing-library/react'
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

afterEach(() => vi.unstubAllGlobals())

describe('LandingPage', () => {
  it('책장을 연결하고 표지를 앞뒤로 전환한다', async () => {
    setupResizeObserver()
    const user = userEvent.setup()
    const { container } = render(<LandingPage />, { wrapper: TestRouter })

    expect(screen.getByRole('link', { name: '내 PDF로 시작하기' })).toHaveAttribute(
      'href',
      '/library',
    )
    const carousel = screen.getByRole('region', { name: '직접 만든 책 표지' })
    const firstCover = container.querySelector<HTMLDivElement>(
      '.landing-book:has(img[src="/landing/operating-systems.svg"])',
    )
    expect(within(carousel).getByRole('status')).toHaveTextContent('운영체제의 기초')
    await user.click(within(carousel).getByRole('button', { name: '다음 책' }))
    expect(within(carousel).getByRole('status')).toHaveTextContent('그림으로 배우는 자료구조')
    expect(firstCover?.style.transform).toContain('+ 1 * var(--book-spread)')
    await user.click(within(carousel).getByRole('button', { name: '이전 책' }))
    expect(within(carousel).getByRole('status')).toHaveTextContent('운영체제의 기초')
  })

  it('공통 헤더와 푸터에서 로고, 테마 전환, 서비스 안내를 제공한다', () => {
    setupResizeObserver()
    render(<LandingPage />, { wrapper: TestRouter })

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'oh-my-ebook 홈' })).toContainElement(
      within(header).getByRole('img', { name: 'oh-my-ebook' }),
    )
    expect(within(header).getByRole('button', { name: '다크 모드로 전환' })).toBeVisible()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('개인정보처리방침')
    expect(screen.queryByText('내 자료로 읽고, 질문하고, 이해하는 서재.')).not.toBeInTheDocument()
  })

  it('PDF 전자책의 독서 흐름을 핵심 가치로 안내한다', () => {
    setupResizeObserver()
    render(<LandingPage />, { wrapper: TestRouter })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '책 밖으로 나가지 않고,읽던 맥락 그대로.',
    )
    expect(
      screen.getByText(/다른 앱을 열거나 책의 맥락을 다시 설명할 필요가 없습니다/),
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: /궁금한 건 바로 묻고,/ })).toHaveTextContent(
      /궁금한 건 바로 묻고,\s*읽던 책은 계속 읽고./,
    )
    expect(screen.getByText(/펼친 두 페이지를 한 번에 스캔했거나/)).toHaveTextContent(
      /읽는 순서대로 글자를 인식합니다/,
    )
    expect(screen.getByRole('heading', { name: /앱을 오가는 대신,/ })).toHaveTextContent(
      /앱을 오가는 대신,\s*한 권에 더 깊이./,
    )
    expect(screen.getByText(/모바일이나 일부 브라우저·기기에서는/)).toBeVisible()
    expect(screen.queryByText(/강의 자료/)).not.toBeInTheDocument()
  })

  it('실제 채팅처럼 요약 질문을 보내고 자유 질문에는 체험 범위를 안내한다', async () => {
    setupResizeObserver()
    const user = userEvent.setup()
    render(<LandingPage />, { wrapper: TestRouter })
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
