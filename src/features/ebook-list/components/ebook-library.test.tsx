import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { EbookLibrary } from './ebook-library'

function createStore() {
  return {
    request: vi.fn(async (command: string): Promise<unknown> =>
      command === 'listBooks' ? [] : null,
    ),
  }
}

describe('EbookLibrary', () => {
  it('초기화 중 책장 조작을 비활성화하고 완료 후 빈 상태를 알린다', async () => {
    const initialization = createPromiseController<unknown>()
    const store = createStore()
    store.request.mockImplementationOnce(() => initialization.promise)
    render(<EbookLibrary store={store} />)

    expect(screen.getByRole('status', { name: '책장 불러오는 중' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF 추가' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled()

    initialization.resolve(null)
    expect(await screen.findByText('아직 저장한 책이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText(/이 브라우저에만 저장/)).toBeInTheDocument()
    expect(screen.getByText(/브라우저 데이터를 삭제하면/)).toBeInTheDocument()
    expect(store.request).toHaveBeenCalledWith('listBooks')
  })

  it('DB 초기화가 실패하면 오류를 보여 주고 재시도한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.request.mockRejectedValueOnce(new Error('failed'))
    render(<EbookLibrary store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('로컬 저장소에 접근하지 못했습니다.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('아직 저장한 책이 없습니다.')).toBeInTheDocument()
    expect(store.request).toHaveBeenCalledTimes(3)
  })
})
