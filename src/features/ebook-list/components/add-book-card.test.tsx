import { fireEvent, render, screen } from '@testing-library/react'
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

  it('카드에 끌어다 놓은 PDF를 추가한다', () => {
    const onFilesSelected = vi.fn()
    render(<AddBookCard onFilesSelected={onFilesSelected} />)

    const file = new File(['pdf'], 'dropped.pdf', { type: 'application/pdf' })
    const card = screen.getByRole('button', { name: '책 추가' })
    fireEvent.drop(card, { dataTransfer: { files: [file] } })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
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
