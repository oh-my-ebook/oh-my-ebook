import { useRef } from 'react'
import { Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

interface AddBookCardProps {
  isUploading?: boolean
  disabled?: boolean
  dragActive?: boolean
  onFilesSelected(files: File[]): void
}

export function AddBookCard({
  isUploading = false,
  disabled = false,
  dragActive = false,
  onFilesSelected,
}: AddBookCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const unavailable = disabled || isUploading

  function selectFiles(files: File[]) {
    if (files.length === 0 || unavailable) return
    onFilesSelected(files)
  }

  return (
    <article aria-label="책 추가" className="book-card group">
      <input
        ref={inputRef}
        aria-label="PDF 파일 선택"
        className="sr-only"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        disabled={unavailable}
        tabIndex={-1}
        onChange={(event) => {
          selectFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      <button
        aria-label="책 추가"
        className="book-card-cover w-full flex-col gap-2 border-dashed text-muted-foreground shadow-none"
        data-dragging={dragActive}
        disabled={unavailable}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {isUploading ? <Spinner /> : <Plus />}
        <span className="font-medium">책 추가</span>
        <span className="text-xs">클릭하거나 끌어다 놓으세요.</span>
      </button>
    </article>
  )
}
