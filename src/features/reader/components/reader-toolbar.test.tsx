import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderToolbar } from './reader-toolbar'

function renderToolbar() {
  const panelButtonRef = { current: null }

  render(
    <ReaderToolbar
      isSpreadAvailable
      onTogglePanel={vi.fn()}
      onViewChange={vi.fn()}
      panelButtonRef={panelButtonRef}
      panelOpen={false}
      preferredView="single"
      title="리더 UI 테스트"
    />,
  )
}

describe('ReaderToolbar', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('독서 도구와 문서명을 상단에 표시한다', () => {
    renderToolbar()

    expect(screen.getByRole('banner', { name: '독서 도구' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '리더 UI 테스트' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '책장으로 돌아가기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '목차 열기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '책갈피' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '어두운 테마' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '함께 읽기 패널 열기' })).toBeEnabled()
  })

  it('목차 버튼을 누르면 항목이 없는 왼쪽 패널을 연다', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    const toc = screen.getByRole('dialog', { name: '목차' })
    expect(toc).toBeInTheDocument()
    expect(within(toc).queryByRole('link')).not.toBeInTheDocument()
    expect(within(toc).getByRole('button', { name: '목차 닫기' })).toBeInTheDocument()
  })

  it('테마 버튼을 누르면 다크 모드와 라이트 모드를 전환한다', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: '어두운 테마' }))
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: '밝은 테마' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
