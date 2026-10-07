import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface EditBookDialogProps {
  bookId: string
  bookTitle: string
  onOpenChange(open: boolean): void
  onRename(title: string): void
  open: boolean
}

export function EditBookDialog({
  bookId,
  bookTitle,
  onOpenChange,
  onRename,
  open,
}: EditBookDialogProps) {
  const [title, setTitle] = useState(bookTitle)

  function saveTitle() {
    onRename(title.trim())
    onOpenChange(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>책 제목 수정</DialogTitle>
          <DialogDescription>책장에 표시할 제목을 변경합니다.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`book-title-${bookId}`}>책 제목</FieldLabel>
            <Input
              id={`book-title-${bookId}`}
              onChange={(event) => setTitle(event.currentTarget.value)}
              value={title}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            취소
          </Button>
          <Button disabled={title.trim().length === 0} onClick={saveTitle}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
