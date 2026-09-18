import { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ReaderToc } from './reader-toc'

function TocHarness({ isWideScreen }: { isWideScreen: boolean }) {
  const [open, setOpen] = useState(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button onClick={() => setOpen((value) => !value)} ref={openButtonRef} type="button">
        목차 열기
      </button>
      <ReaderToc
        isWideScreen={isWideScreen}
        onOpenChange={setOpen}
        open={open}
        openButtonRef={openButtonRef}
      />
    </>
  )
}

describe('ReaderToc', () => {
  it('넓은 화면에서는 헤더 없이 본문을 덮지 않는 옆 영역으로 열고 열기 버튼으로 닫는다', async () => {
    const user = userEvent.setup()
    render(<TocHarness isWideScreen />)
    const openButton = screen.getByRole('button', { name: '목차 열기' })

    await user.click(openButton)

    const toc = screen.getByRole('region', { name: '목차' })
    expect(screen.queryByRole('dialog', { name: '목차' })).not.toBeInTheDocument()
    expect(within(toc).queryByRole('heading')).not.toBeInTheDocument()
    expect(within(toc).queryByRole('button')).not.toBeInTheDocument()
    expect(within(toc).queryByRole('link')).not.toBeInTheDocument()

    await user.click(openButton)

    expect(screen.queryByRole('region', { name: '목차' })).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })

  it('좁은 화면에서는 왼쪽 Sheet로 연다', async () => {
    const user = userEvent.setup()
    render(<TocHarness isWideScreen={false} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    const toc = await screen.findByRole('dialog', { name: '목차' })
    expect(within(toc).queryByRole('link')).not.toBeInTheDocument()
    expect(within(toc).getByRole('button', { name: '목차 닫기' })).toBeInTheDocument()
  })
})
