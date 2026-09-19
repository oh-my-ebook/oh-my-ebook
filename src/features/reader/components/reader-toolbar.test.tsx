import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReaderToolbar } from './reader-toolbar'

function renderToolbar({ tocOpen = false, onToggleToc = vi.fn() } = {}) {
  render(
    <MemoryRouter>
      <ReaderToolbar
        isSpreadAvailable
        onTogglePanel={vi.fn()}
        onToggleToc={onToggleToc}
        onViewChange={vi.fn()}
        panelButtonRef={{ current: null }}
        panelOpen={false}
        preferredView="single"
        title="리더 UI 테스트"
        tocButtonRef={{ current: null }}
        tocOpen={tocOpen}
      />
    </MemoryRouter>,
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

  it('목차 버튼은 목차 열기·닫기를 요청하고 열린 상태를 표시한다', async () => {
    const user = userEvent.setup()
    const onToggleToc = vi.fn()
    renderToolbar({ onToggleToc })

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    expect(onToggleToc).toHaveBeenCalledOnce()
  })

  it('목차가 열려 있으면 버튼이 닫기 조작으로 눌린 상태를 표시한다', () => {
    renderToolbar({ tocOpen: true })

    expect(screen.getByRole('button', { name: '목차 닫기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('테마 버튼을 누르면 다크 모드와 라이트 모드를 전환한다', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: '어두운 테마' }))
    expect(document.documentElement).toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: '밝은 테마' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('두 페이지 보기를 적용할 수 없으면 보기 방식 조작만 숨기고 구분선은 유지한다', () => {
    const toolbar = (isSpreadAvailable: boolean) => (
      <MemoryRouter>
        <ReaderToolbar
          isSpreadAvailable={isSpreadAvailable}
          onTogglePanel={vi.fn()}
          onViewChange={vi.fn()}
          onToggleToc={vi.fn()}
          panelButtonRef={{ current: null }}
          panelOpen={false}
          preferredView="single"
          title="리더 UI 테스트"
          tocButtonRef={{ current: null }}
          tocOpen={false}
        />
      </MemoryRouter>
    )
    const { rerender } = render(toolbar(true))
    const banner = screen.getByRole('banner', { name: '독서 도구' })
    const separatorCount = within(banner).getAllByRole('separator').length

    rerender(toolbar(false))

    expect(within(banner).queryByRole('group', { name: '보기 방식' })).not.toBeInTheDocument()
    expect(within(banner).getAllByRole('separator')).toHaveLength(separatorCount)
  })
})
