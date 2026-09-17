import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { DeleteBookDialog } from './delete-book-dialog'

function DialogFixture({ onDelete }: { onDelete(): Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>삭제 열기</button>
      <DeleteBookDialog
        bookTitle="테스트 책"
        onDelete={onDelete}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  )
}

describe('DeleteBookDialog', () => {
  it('책 제목과 삭제 범위·복구 불가 안내를 표시하고 취소하면 삭제하지 않는다', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(async () => undefined)
    render(<DialogFixture onDelete={onDelete} />)

    const trigger = screen.getByRole('button', { name: '삭제 열기' })
    await user.click(trigger)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('“테스트 책”을 삭제할까요?')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('PDF 원본과 읽기 위치')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('복구할 수 없습니다.')

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('삭제 중에는 조작을 막고 실패하면 같은 다이얼로그에서 재시도한다', async () => {
    const user = userEvent.setup()
    const pending = createPromiseController<void>()
    const onDelete = vi.fn()
    onDelete.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(undefined)
    render(<DialogFixture onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: '삭제 열기' }))
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(screen.getByRole('button', { name: '삭제 중…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()

    pending.reject(new Error('failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('책을 삭제하지 못했습니다.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onDelete).toHaveBeenCalledTimes(2)
  })
})
