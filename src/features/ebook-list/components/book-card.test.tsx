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
  author: null,
  pdf_title: null,
  pdf_subject: null,
  pdf_keywords: null,
  publisher: null,
  pdf_size: 0,
  page_count: 100,
  cover_data: new Uint8Array([1, 2, 3]),
  cover_mime: 'image/png',
  cover_status: 'ready',
  pdf_status: 'available',
  last_page: null,
  analysis_status: 'analyzing',
  ocr_completed_at: null,
  indexed_at: null,
  created_at: 0,
  updated_at: 0,
}

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:cover', revokeObjectURL: vi.fn() })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(pointer: fine)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

describe('BookCard', () => {
  it('표지와 제목, 읽지 않은 책의 전체 페이지를 표시한다', () => {
    render(<BookCard book={book} onOpen={vi.fn()} />)

    expect(screen.getByRole('img', { name: `${book.title} 표지` })).toHaveAttribute(
      'src',
      'blob:cover',
    )
    expect(screen.getByRole('heading', { name: book.title })).toBeVisible()
    expect(screen.getByText('읽지 않음 · 전체 100페이지')).toBeVisible()
  })

  it('마지막 읽은 페이지를 전체 페이지와 함께 표시한다', () => {
    render(<BookCard book={{ ...book, last_page: 12 }} onOpen={vi.fn()} />)

    expect(screen.getByText('12 / 100페이지')).toBeVisible()
  })

  it('분석 상태에 맞는 딱지를 표시한다', () => {
    const { rerender } = render(<BookCard book={book} onOpen={vi.fn()} />)

    expect(screen.getByText('분석 중')).toHaveAttribute('data-variant', 'secondary')

    rerender(<BookCard book={{ ...book, analysis_status: 'ready' }} onOpen={vi.fn()} />)
    expect(screen.getByText('분석 완료')).toHaveAttribute('data-variant', 'default')

    rerender(<BookCard book={{ ...book, analysis_status: 'failed' }} onOpen={vi.fn()} />)
    expect(screen.getByText('분석 실패')).toHaveAttribute('data-variant', 'destructive')
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

  it('메뉴에서 제목을 수정하고 삭제 확인을 요청한다', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    const onDelete = vi.fn(async () => undefined)
    render(<BookCard book={book} onDelete={onDelete} onOpen={vi.fn()} onRename={onRename} />)

    await user.click(screen.getByRole('button', { name: `${book.title} 메뉴` }))
    await user.click(await screen.findByRole('menuitem', { name: '책 제목 수정' }))
    const input = screen.getByLabelText('책 제목')
    await user.clear(input)
    await user.type(input, '바꾼 제목')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(onRename).toHaveBeenCalledWith('바꾼 제목')

    await user.click(screen.getByRole('button', { name: `${book.title} 메뉴` }))
    await user.click(await screen.findByRole('menuitem', { name: '책 삭제' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(`“${book.title}”을 삭제할까요?`)
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('메뉴에서 삭제를 취소하면 메뉴 버튼으로 포커스를 복원한다', async () => {
    const user = userEvent.setup()
    render(<BookCard book={book} onDelete={vi.fn(async () => undefined)} onOpen={vi.fn()} />)

    const menuButton = screen.getByRole('button', { name: `${book.title} 메뉴` })
    await user.click(menuButton)
    await user.click(await screen.findByRole('menuitem', { name: '책 삭제' }))
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(menuButton).toHaveFocus()
  })

  it('원본 PDF가 없으면 깨진 표지를 보이고 클릭 시 삭제 확인을 연다', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <BookCard
        book={{ ...book, pdf_status: 'missing' }}
        onDelete={vi.fn(async () => undefined)}
        onOpen={onOpen}
      />,
    )

    expect(screen.getByRole('img', { name: '원본 PDF 없음' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: `${book.title} 삭제` }))

    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(`“${book.title}”을 삭제할까요?`)
  })
})
