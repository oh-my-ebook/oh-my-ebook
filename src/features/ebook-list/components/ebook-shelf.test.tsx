import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StoredBook } from '../ebook-types'
import { EbookShelf } from './ebook-shelf'

function createBook(id: string, title: string): StoredBook {
  return {
    id,
    content_hash: `${id}-hash`,
    file_name: `${id}.pdf`,
    title,
    author: null,
    pdf_title: null,
    pdf_subject: null,
    pdf_keywords: null,
    publisher: null,
    pdf_size: 0,
    page_count: 100,
    cover_data: null,
    cover_mime: null,
    cover_status: 'ready',
    pdf_status: 'available' as const,
    last_page: null,
    created_at: 0,
    updated_at: 0,
  }
}

describe('EbookShelf', () => {
  it('책마다 식별 가능한 카드 단위를 만들고 목록 순서로 연다', async () => {
    const user = userEvent.setup()
    const onOpenBook = vi.fn()
    render(
      <EbookShelf
        books={[createBook('first', '첫 번째 책'), createBook('second', '두 번째 책')]}
        coverErrors={{}}
        onOpenBook={onOpenBook}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('article', { name: '첫 번째 책' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '두 번째 책' })).toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('button', { name: '첫 번째 책 열기' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.tab()
    expect(screen.getByRole('button', { name: '첫 번째 책 메뉴' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '두 번째 책 열기' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onOpenBook).toHaveBeenNthCalledWith(1, 'first')
    expect(onOpenBook).toHaveBeenNthCalledWith(2, 'second')
  })
})
