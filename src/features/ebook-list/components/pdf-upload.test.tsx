import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PdfUpload } from './pdf-upload'

describe('PdfUpload', () => {
  it('여러 PDF를 선택하고 파일별 상태를 알리며 처리 중 선택을 막는다', async () => {
    const user = userEvent.setup()
    const onFilesSelected = vi.fn()
    const { rerender } = render(<PdfUpload items={[]} onFilesSelected={onFilesSelected} />)
    const input = screen.getByLabelText('PDF 파일 선택')
    const files = [
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ]

    await user.upload(input, files)
    expect(onFilesSelected).toHaveBeenCalledWith(files)

    rerender(
      <PdfUpload
        isUploading
        items={[
          { id: '1', name: 'first.pdf', status: 'processing' },
          { id: '2', name: 'second.pdf', status: 'pending' },
        ]}
        onFilesSelected={onFilesSelected}
      />,
    )
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'PDF 추가' })).toBeDisabled()
    expect(within(screen.getByText('first.pdf').closest('li')!).getByText('처리 중')).toBeVisible()
    expect(within(screen.getByText('second.pdf').closest('li')!).getByText('대기 중')).toBeVisible()

    rerender(
      <PdfUpload
        items={[
          { id: '1', name: 'first.pdf', status: 'success' },
          { id: '2', name: 'second.pdf', status: 'error', message: '손상된 PDF입니다.' },
        ]}
        onFilesSelected={onFilesSelected}
      />,
    )
    expect(screen.getByText('완료')).toBeVisible()
    expect(screen.getByText('손상된 PDF입니다.')).toBeVisible()
  })
})
