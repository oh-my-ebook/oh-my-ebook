import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PdfUpload } from './pdf-upload'

describe('PdfUpload', () => {
  it('여러 PDF를 선택하고 완료와 오류를 토스트로 알리며 처리 중 선택을 막는다', async () => {
    const user = userEvent.setup()
    const onFilesSelected = vi.fn()
    const { rerender } = render(<PdfUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByLabelText('PDF 파일 선택')
    const files = [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ]

    await user.upload(input, files)
    expect(onFilesSelected).toHaveBeenCalledWith(files)

    rerender(<PdfUpload busy onFilesSelected={onFilesSelected} />)
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'PDF 업로드' })).toBeDisabled()
    expect(screen.queryByRole('list', { name: '파일별 업로드 결과' })).not.toBeInTheDocument()

    rerender(<PdfUpload onFilesSelected={onFilesSelected} />)
    expect(screen.queryByText('완료')).not.toBeInTheDocument()
    expect(screen.queryByText('손상된 PDF입니다.')).not.toBeInTheDocument()
  })
})
