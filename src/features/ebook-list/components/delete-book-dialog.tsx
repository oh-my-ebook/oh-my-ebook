import { useState } from 'react'
import { ErrorAlert } from '@/components/error-alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteBookDialogProps {
  bookTitle: string
  onDelete(): Promise<void>
  onOpenChange(open: boolean): void
  open: boolean
}

export function DeleteBookDialog({
  bookTitle,
  onDelete,
  onOpenChange,
  open,
}: DeleteBookDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)

  async function deleteBook() {
    setDeleting(true)
    setFailed(false)
    try {
      await onDelete()
      onOpenChange(false)
    } catch {
      setFailed(true)
    } finally {
      setDeleting(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (deleting) return
    if (!nextOpen) setFailed(false)
    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`“${bookTitle}”을 삭제할까요?`}</AlertDialogTitle>
          <AlertDialogDescription>
            PDF 원본과 읽기 위치가 이 브라우저에서 삭제되며 복구할 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <ErrorAlert description="잠시 후 다시 시도해 주세요." title="책을 삭제하지 못했습니다." />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={() => void deleteBook()}
            variant="destructive"
          >
            {deleting ? '삭제 중…' : failed ? '다시 시도' : '삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
