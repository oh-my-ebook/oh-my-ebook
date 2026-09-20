import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddBookCard } from './add-book-card'

describe('AddBookCard', () => {
  it('파일 선택 대화상자로 고른 PDF를 추가한다', async () => {
    const user = userEvent.setup()
    const onFilesSelected = vi.fn()
    render(<AddBookCard onFilesSelected={onFilesSelected} />)

    const files = [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ]
    await user.upload(screen.getByLabelText('PDF 파일 선택'), files)

    expect(onFilesSelected).toHaveBeenCalledWith(files)
  })

  it('페이지에 파일을 끌고 온 상태를 카드에 강조 표시한다', () => {
    const { rerender } = render(<AddBookCard dragActive={false} onFilesSelected={vi.fn()} />)
    expect(screen.getByRole('button', { name: '책 추가' })).toHaveAttribute(
      'data-dragging',
      'false',
    )

    rerender(<AddBookCard dragActive onFilesSelected={vi.fn()} />)
    expect(screen.getByRole('button', { name: '책 추가' })).toHaveAttribute('data-dragging', 'true')
  })

  it('업로드 중이거나 비활성화된 경우 선택을 막는다', () => {
    const onFilesSelected = vi.fn()
    const { rerender } = render(<AddBookCard isUploading onFilesSelected={onFilesSelected} />)

    expect(screen.getByRole('button', { name: '책 추가' })).toBeDisabled()
    expect(screen.getByLabelText('PDF 파일 선택')).toBeDisabled()

    rerender(<AddBookCard disabled onFilesSelected={onFilesSelected} />)
    expect(screen.getByRole('button', { name: '책 추가' })).toBeDisabled()
  })
})
