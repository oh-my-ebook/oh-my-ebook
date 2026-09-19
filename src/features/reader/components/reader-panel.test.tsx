import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ReaderPanel } from './reader-panel'

const PANEL_TITLE = '함께 읽기'
const OPEN_BUTTON_LABEL = '함께 읽기 패널 열기'
const RESIZE_HANDLE_LABEL = '함께 읽기 패널 너비 조절'
const CHAT_INPUT_LABEL = '질문 입력'

interface HarnessProps {
  chatSessionKey?: string
  initialOpen?: boolean
  isWideScreen: boolean
}

function ReaderPanelHarness({ chatSessionKey, initialOpen = false, isWideScreen }: HarnessProps) {
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(initialOpen)

  const openButton = (
    <button onClick={() => setOpen(true)} ref={openButtonRef} type="button">
      {OPEN_BUTTON_LABEL}
    </button>
  )
  const readerPanel = (
    <ReaderPanel
      chatSessionKey={chatSessionKey}
      isWideScreen={isWideScreen}
      onOpenChange={setOpen}
      open={open}
      openButtonRef={openButtonRef}
    />
  )

  if (!isWideScreen) {
    return (
      <>
        {openButton}
        {readerPanel}
      </>
    )
  }

  // react-resizable-panels는 Panel과 Separator가 Group의 직접 DOM 자식이어야 하므로
  // reader.tsx처럼 ReaderPanel을 본문 Panel의 형제로 둔다.
  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel defaultSize="70%">{openButton}</ResizablePanel>
      {readerPanel}
    </ResizablePanelGroup>
  )
}

describe('ReaderPanel', () => {
  // ReaderChat이 내부적으로 렌더링하는 Thread가 ResizeObserver를 사용하므로 jsdom에 없는 API를 채워준다.
  // 패널이 열리는 거의 모든 테스트가 이제 ReaderChat을 함께 렌더링하므로 매번 새로 만들어 제공한다.
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('넓은 화면에서 열림 상태면 본문 옆 보조 영역으로 표시한다', () => {
    render(<ReaderPanelHarness initialOpen isWideScreen />)

    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: RESIZE_HANDLE_LABEL })).toBeInTheDocument()
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

  it('넓은 화면에서 열기 버튼으로 연 뒤 Escape를 누르면 패널을 닫고 열기 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness isWideScreen />)
    await user.click(screen.getByRole('button', { name: OPEN_BUTTON_LABEL }))
    expect(screen.getByRole('region', { name: PANEL_TITLE })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: CHAT_INPUT_LABEL })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: OPEN_BUTTON_LABEL })).toHaveFocus()
  })

  it('넓은 화면에서 패널 안에 포커스가 있을 때 Escape를 누르면 패널을 닫고 열기 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<ReaderPanelHarness initialOpen isWideScreen />)
    await user.click(screen.getByRole('textbox', { name: CHAT_INPUT_LABEL }))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('region', { name: PANEL_TITLE })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: CHAT_INPUT_LABEL })).not.toBeInTheDocument()
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

  it('패널이 열려 있으면 채팅 입력창이 보인다', () => {
    render(<ReaderPanelHarness initialOpen isWideScreen />)

    expect(screen.getByRole('textbox', { name: CHAT_INPUT_LABEL })).toBeInTheDocument()
  })

  it('chatSessionKey가 바뀌면(문서 변경) 패널을 닫지 않아도 대화가 초기화된다', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ReaderPanelHarness chatSessionKey="doc-a" initialOpen isWideScreen />,
    )

    // jsdom에서는 요소 크기가 모두 0이라 react-resizable-panels가 모든 클릭을 구분선 드래그로
    // 판정해 포커스 이동을 막는다. 클릭 없이 입력하도록 포커스만 옮긴다.
    screen.getByRole('textbox', { name: CHAT_INPUT_LABEL }).focus()
    await user.keyboard('질문{Enter}')
    expect(await screen.findByText('질문')).toBeInTheDocument()

    rerender(<ReaderPanelHarness chatSessionKey="doc-b" initialOpen isWideScreen />)

    expect(screen.queryByText('질문')).not.toBeInTheDocument()
  })
})
