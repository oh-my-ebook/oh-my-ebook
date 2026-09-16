import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface UploadItem {
  id: string
  name: string
  status: 'pending' | 'processing' | 'success' | 'error'
  message?: string
}

interface PdfUploadProps {
  items: UploadItem[]
  busy?: boolean
  disabled?: boolean
  onFilesSelected(files: File[]): void
}

const labels = {
  pending: '대기 중',
  processing: '처리 중',
  success: '완료',
  error: '실패',
}

export function PdfUpload({
  items,
  busy = false,
  disabled = false,
  onFilesSelected,
}: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section aria-label="PDF 업로드">
      <input
        ref={inputRef}
        aria-label="PDF 파일 선택"
        className="sr-only"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        disabled={disabled || busy}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (files.length > 0 && !busy && !disabled) onFilesSelected(files)
        }}
      />
      <Button disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
        PDF 추가
      </Button>
      {items.length > 0 && (
        <ul aria-label="파일별 업로드 결과" className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
              <span>{item.name}</span>
              <span role="status">{item.message ?? labels[item.status]}</span>
              {item.status === 'processing' && (
                <Progress aria-label={`${item.name} 처리 중`} value={null} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
