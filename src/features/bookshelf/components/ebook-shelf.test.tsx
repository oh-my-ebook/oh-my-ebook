import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StoredBook } from '@/lib/ebook-storage/types/book'
import { EbookShelf } from './ebook-shelf'

function createBook(id: string, title: string): StoredBook {
  return {
    id,
    contentHash: `${id}-hash`,
    fileName: `${id}.pdf`,
    title,
    author: null,
    pdfTitle: null,
    pdfSubject: null,
    pdfKeywords: null,
    publisher: null,
    pdfSize: 0,
    pageCount: 100,
    coverData: null,
    coverMime: null,
    pdfStatus: 'available' as const,
    lastPage: null,
    analysisStatus: 'analyzing',
    ocrCompletedAt: null,
    indexedAt: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('EbookShelf', () => {
  it('책 추가 카드를 목록 맨 앞에 두고 책마다 식별 가능한 카드 단위를 만들어 목록 순서로 연다', async () => {
    const user = userEvent.setup()
    const onOpenBook = vi.fn()
    render(
      <EbookShelf
        books={[createBook('first', '첫 번째 책'), createBook('second', '두 번째 책')]}
        coverErrors={{}}
        onFilesSelected={vi.fn()}
        onOpenBook={onOpenBook}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('article', { name: '첫 번째 책' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '두 번째 책' })).toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('button', { name: '책 추가' })).toHaveFocus()
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

  it('업로드 중이거나 비활성화된 경우 책 추가 카드의 선택을 막는다', () => {
    const { rerender } = render(
      <EbookShelf
        books={[]}
        coverErrors={{}}
        disabled
        onFilesSelected={vi.fn()}
        onOpenBook={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )
    expect(screen.getByRole('button', { name: '책 추가' })).toBeDisabled()

    rerender(
      <EbookShelf
        books={[]}
        coverErrors={{}}
        isUploading
        onFilesSelected={vi.fn()}
        onOpenBook={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )
    expect(screen.getByRole('button', { name: '책 추가' })).toBeDisabled()
  })

  it('페이지 드래그 상태를 책 추가 카드에 전달한다', () => {
    const { rerender } = render(
      <EbookShelf
        books={[]}
        coverErrors={{}}
        dragActive={false}
        onFilesSelected={vi.fn()}
        onOpenBook={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )
    expect(screen.getByRole('button', { name: '책 추가' })).toHaveAttribute(
      'data-dragging',
      'false',
    )

    rerender(
      <EbookShelf
        books={[]}
        coverErrors={{}}
        dragActive
        onFilesSelected={vi.fn()}
        onOpenBook={vi.fn()}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onRename={vi.fn()}
        regeneratingCover={null}
      />,
    )
    expect(screen.getByRole('button', { name: '책 추가' })).toHaveAttribute('data-dragging', 'true')
  })
})
