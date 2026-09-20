import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { ClearOriginDataDialog } from './clear-origin-data-dialog'

function DialogFixture({ onClear }: { onClear(): Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>저장소 관리 열기</button>
      <ClearOriginDataDialog onClear={onClear} onOpenChange={setOpen} open={open} />
    </>
  )
}

describe('ClearOriginDataDialog', () => {
  it('삭제 범위를 안내하고 취소하면 데이터를 지우지 않는다', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn(async () => undefined)
    render(<DialogFixture onClear={onClear} />)

    const trigger = screen.getByRole('button', { name: '저장소 관리 열기' })
    await user.click(trigger)

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '이 브라우저의 모든 앱 데이터를 삭제할까요?',
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent('PDF와 분석 데이터')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('복구할 수 없습니다.')

    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onClear).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('삭제 중에는 조작을 막고 실패하면 같은 다이얼로그에서 재시도한다', async () => {
    const user = userEvent.setup()
    const pending = createPromiseController<void>()
    const onClear = vi.fn()
    onClear.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(undefined)
    render(<DialogFixture onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: '저장소 관리 열기' }))
    await user.click(screen.getByRole('button', { name: '모든 데이터 삭제' }))
    expect(screen.getByRole('button', { name: /삭제 중…/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()

    pending.reject(new Error('failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('앱 데이터를 삭제하지 못했습니다.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onClear).toHaveBeenCalledTimes(2)
  })
})
