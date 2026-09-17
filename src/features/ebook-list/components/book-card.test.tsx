import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredBook } from '../ebook-types'
import { BookCard } from './book-card'

const book: StoredBook = {
  id: 'book-id',
  content_hash: 'hash',
  file_name: 'local-library.pdf',
  title: '지역 도서관의 아주 긴 책 제목',
  page_count: 100,
  cover_data: new Uint8Array([1, 2, 3]),
  cover_mime: 'image/png',
  cover_status: 'ready',
  last_page: null,
  created_at: 0,
  updated_at: 0,
}

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:cover', revokeObjectURL: vi.fn() })
})

describe('BookCard', () => {
  it('표지와 제목, 읽지 않은 책의 전체 페이지를 표시한다', () => {
    render(<BookCard book={book} onOpen={vi.fn()} />)

    expect(screen.getByRole('img', { name: `${book.title} 표지` })).toHaveAttribute(
      'src',
      'blob:cover',
    )
    expect(screen.getByText(book.title)).toBeVisible()
    expect(screen.getByText('읽지 않음 · 전체 100페이지')).toBeVisible()
  })

  it('마지막 읽은 페이지를 전체 페이지와 함께 표시한다', () => {
    render(<BookCard book={{ ...book, last_page: 12 }} onOpen={vi.fn()} />)

    expect(screen.getByText('12 / 100페이지')).toBeVisible()
  })

  it('긴 제목의 전체 텍스트를 제공하고 키보드로 책을 연다', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<BookCard book={book} onOpen={onOpen} />)

    expect(screen.getByText(book.title)).toHaveAttribute('title', book.title)

    await user.tab()
    await user.keyboard('{Enter}')

    expect(onOpen).toHaveBeenCalledOnce()
  })
})
