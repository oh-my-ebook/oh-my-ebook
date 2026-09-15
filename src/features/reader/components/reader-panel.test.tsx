import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReaderPanel } from './reader-panel'

const PANEL_TITLE = '보조 패널'
const OPEN_BUTTON_LABEL = '보조 패널 열기'

interface HarnessProps {
  initialOpen?: boolean
  isWideScreen: boolean
}

function ReaderPanelHarness({ initialOpen = false, isWideScreen }: HarnessProps) {
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(initialOpen)

  return (
    <div>
      <button onClick={() => setOpen(true)} ref={openButtonRef} type="button">
        {OPEN_BUTTON_LABEL}
      </button>
      <ReaderPanel
        isWideScreen={isWideScreen}
        onOpenChange={setOpen}
        open={open}
        openButtonRef={openButtonRef}
      />
    </div>
  )
}

describe('ReaderPanel', () => {
  it('넓은 화면에서 열림 상태면 본문 옆 보조 영역으로 표시한다', () => {
    render(<ReaderPanelHarness initialOpen isWideScreen />)

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: PANEL_TITLE })).not.toBeInTheDocument()
  })

  it('넓은 화면에서 닫힘 상태면 보조 영역이 보이지 않는다', () => {
    render(<ReaderPanelHarness isWideScreen />)

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
  })

  it('좁은 화면에서 열림 상태면 Sheet로 표시한다', () => {
    render(<ReaderPanelHarness initialOpen isWideScreen={false} />)

    expect(screen.getByRole('dialog', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
  })

  it('좁은 화면에서 닫힘 상태면 Sheet가 보이지 않는다', () => {
    render(<ReaderPanelHarness isWideScreen={false} />)

    expect(screen.queryByRole('dialog', { name: PANEL_TITLE })).not.toBeInTheDocument()
  })

  it('화면 폭이 넓은 화면에서 좁은 화면으로 바뀌어도 열림 상태를 유지한다', () => {
    const { rerender } = render(<ReaderPanelHarness initialOpen isWideScreen />)
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    rerender(<ReaderPanelHarness initialOpen isWideScreen={false} />)

    expect(screen.getByRole('dialog', { name: PANEL_TITLE })).toBeInTheDocument()
  })

  it('넓은 화면에서 닫기 버튼을 누르면 패널을 닫고 열기 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness initialOpen isWideScreen />)

    await user.click(screen.getByRole('button', { name: '보조 패널 닫기' }))

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).toHaveFocus()
  })

  it('넓은 화면에서 패널 안으로 포커스를 옮기지 않고 Escape를 눌러도 패널을 닫는다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness isWideScreen />)
    await user.click(screen.getByRole('button', { name: OPEN_BUTTON_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).toHaveFocus()
  })

  it('넓은 화면에서 패널 안에 포커스가 있을 때 Escape를 누르면 패널을 닫고 열기 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness initialOpen isWideScreen />)
    screen.getByRole('button', { name: '보조 패널 닫기' }).focus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).toHaveFocus()
  })

  it('좁은 화면에서 Escape를 누르면 Sheet를 닫고 열기 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness initialOpen isWideScreen={false} />)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).toHaveFocus()
  })

  it('처음 닫힌 상태로 마운트되면 열기 버튼으로 포커스를 옮기지 않는다', () => {
    render(<ReaderPanelHarness isWideScreen />)

    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).not.toHaveFocus()
  })
})
