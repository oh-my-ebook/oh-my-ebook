import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/ui/toast'
import type { StoredBook } from '../ebook-types'
import { StorageSummary } from './storage-summary'

function createBook(lastPage: number | null): StoredBook {
  return {
    id: String(lastPage),
    content_hash: 'hash',
    file_name: 'book.pdf',
    title: '책',
    page_count: 100,
    cover_data: null,
    cover_mime: null,
    cover_status: 'ready',
    last_page: lastPage,
    created_at: 0,
    updated_at: 0,
  }
}

describe('StorageSummary', () => {
  it('사용량과 서재 현황을 분리된 카드로 표시한다', () => {
    render(
      <StorageSummary
        books={[createBook(null), createBook(50), createBook(100)]}
        capacity={{ usage: 1024, quota: 4096, remaining: 3072 }}
        persistentStorage={true}
        onRequestPersistence={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('사용 중 1 KB / 4 KB')).toBeVisible()
    expect(screen.getByText(/남은 용량.*3 KB/)).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('저장된 도서').parentElement).toHaveTextContent('저장된 도서3권')
    expect(screen.getByText('읽는 중').parentElement).toHaveTextContent('읽는 중1권')
    expect(screen.getByText('완독').parentElement).toHaveTextContent('완독1권')
  })

  it('조회 실패를 알리고 재시도를 제공한다', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <StorageSummary
        books={[]}
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
          books={[]}
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
        books={[]}
        capacity={{ usage: 0, quota: 1024 ** 3 + 1, remaining: 1024 ** 3 + 1 }}
        persistentStorage={false}
        onRequestPersistence={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '영구 저장 요청' })).not.toBeInTheDocument()
  })
})
