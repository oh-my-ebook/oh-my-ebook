import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EditBookDialog } from './edit-book-dialog'

function DialogFixture({ onRename }: { onRename(title: string): void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>수정 열기</button>
      <EditBookDialog
        bookId="book-id"
        bookTitle="기존 제목"
        onOpenChange={setOpen}
        onRename={onRename}
        open={open}
      />
    </>
  )
}

describe('EditBookDialog', () => {
  it('기존 제목을 표시하고 취소하면 저장하지 않는다', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(<DialogFixture onRename={onRename} />)

    const trigger = screen.getByRole('button', { name: '수정 열기' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '책 제목 수정' })).toBeVisible()
    expect(screen.getByLabelText('책 제목')).toHaveValue('기존 제목')

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onRename).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('공백을 제외한 제목을 저장하고 다이얼로그를 닫는다', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(<DialogFixture onRename={onRename} />)

    await user.click(screen.getByRole('button', { name: '수정 열기' }))
    await user.clear(screen.getByLabelText('책 제목'))
    await user.type(screen.getByLabelText('책 제목'), '  새 제목  ')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(onRename).toHaveBeenCalledWith('새 제목')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
