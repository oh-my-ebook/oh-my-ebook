import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/toast'
import { StorageSummary } from './storage-summary'

describe('StorageSummary', () => {
  it('사용량과 예상 할당량·잔여량을 추정치로 표시한다', () => {
    render(
      <StorageSummary
        capacity={{ usage: 1024, quota: 4096, remaining: 3072 }}
        persistentStorage={true}
        onRequestPersistence={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText(/사용량.*1 KB/)).toBeVisible()
    expect(screen.getByText(/할당량.*4 KB/)).toBeVisible()
    expect(screen.getByText(/잔여량.*3 KB/)).toBeVisible()
    expect(screen.getByText(/브라우저 추정치/)).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
  })

  it('조회 실패를 알리고 재시도를 제공한다', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <StorageSummary
        capacity={null}
        persistentStorage={false}
        onRequestPersistence={vi.fn()}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(/확인할 수 없습니다/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '용량 다시 확인' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('예상 잔여량이 1GB 이하일 때만 영구 저장 요청을 제공하고 거부를 알린다', async () => {
    const user = userEvent.setup()
    const onRequestPersistence = vi.fn(async () => false)
    render(
      <>
        <StorageSummary
          capacity={{ usage: 0, quota: 1024 ** 3, remaining: 1024 ** 3 }}
          persistentStorage={false}
          onRequestPersistence={onRequestPersistence}
          onRetry={vi.fn()}
        />
        <Toaster />
      </>,
    )

    await user.click(screen.getByRole('button', { name: '영구 저장 요청' }))

    expect(onRequestPersistence).toHaveBeenCalledOnce()
    expect(await screen.findByText('영구 저장 전환에 실패했습니다.')).toBeVisible()
  })

  it('예상 잔여량이 1GB를 넘으면 영구 저장 요청을 숨긴다', () => {
    render(
      <StorageSummary
        capacity={{ usage: 0, quota: 1024 ** 3 + 1, remaining: 1024 ** 3 + 1 }}
        persistentStorage={false}
        onRequestPersistence={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '영구 저장 요청' })).not.toBeInTheDocument()
  })
})
