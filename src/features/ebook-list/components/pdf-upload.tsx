import { useRef, useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface PdfUploadProps {
  isUploading?: boolean
  disabled?: boolean
  onFilesSelected(files: File[]): void
}

export function PdfUpload({
  isUploading = false,
  disabled = false,
  onFilesSelected,
}: PdfUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const unavailable = disabled || isUploading
  function selectFiles(files: File[]) {
    if (files.length === 0 || unavailable) return
    onFilesSelected(files)
    setOpen(false)
  }

  return (
    <section aria-label="PDF 업로드">
      <input
        ref={inputRef}
        aria-label="PDF 파일 선택"
        className="sr-only"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        disabled={unavailable}
        onChange={(event) => {
          selectFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ''
        }}
      />
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger render={<Button disabled={unavailable} />}>
          <Upload data-icon="inline-start" />
          PDF 업로드
        </DialogTrigger>
        <DialogContent className="max-w-lg p-6" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>도서 추가</DialogTitle>
            <DialogDescription>
              내 기기에 있는 PDF를 이 브라우저 서재에 등록합니다.
            </DialogDescription>
          </DialogHeader>
          <div
            aria-label="PDF 파일 놓기 영역"
            className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-muted/40 p-6 text-center"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              selectFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <FileUp className="text-primary" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">PDF 파일을 이곳으로 끌어다 놓으세요</p>
              <p className="text-sm text-muted-foreground">
                또는 컴퓨터에서 직접 선택할 수 있습니다.
              </p>
            </div>
            <Button
              disabled={unavailable}
              onClick={() => inputRef.current?.click()}
              variant="outline"
            >
              컴퓨터에서 파일 선택
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            서버 전송 없이 이 브라우저에만 보관됩니다.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  )
}
