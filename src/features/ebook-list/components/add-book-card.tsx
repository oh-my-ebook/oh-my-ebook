import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

interface AddBookCardProps {
  isUploading?: boolean
  disabled?: boolean
  onFilesSelected(files: File[]): void
}

export function AddBookCard({
  isUploading = false,
  disabled = false,
  onFilesSelected,
}: AddBookCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const unavailable = disabled || isUploading

  function selectFiles(files: File[]) {
    if (files.length === 0 || unavailable) return
    onFilesSelected(files)
  }

  return (
    <article aria-label="책 추가" className="book-card">
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
        className="book-card-cover h-full w-full flex-col gap-2 border-dashed text-muted-foreground shadow-none transition-colors data-[dragging=true]:border-primary data-[dragging=true]:bg-primary/10 data-[dragging=true]:text-primary"
        data-dragging={dragging}
        disabled={unavailable}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!unavailable) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          selectFiles(Array.from(event.dataTransfer.files))
        }}
        type="button"
      >
        {isUploading ? <Spinner /> : <Plus />}
        <span className="font-medium">책 추가</span>
        <span className="text-xs">클릭하거나 끌어다 놓으세요.</span>
      </button>
    </article>
  )
}
