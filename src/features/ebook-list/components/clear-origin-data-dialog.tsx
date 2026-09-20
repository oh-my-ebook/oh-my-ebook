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
import { Spinner } from '@/components/ui/spinner'

interface ClearOriginDataDialogProps {
  onClear(): Promise<void>
  onOpenChange(open: boolean): void
  open: boolean
}

export function ClearOriginDataDialog({ onClear, onOpenChange, open }: ClearOriginDataDialogProps) {
  const [clearing, setClearing] = useState(false)
  const [failed, setFailed] = useState(false)

  async function clearData() {
    setClearing(true)
    setFailed(false)
    try {
      await onClear()
      onOpenChange(false)
    } catch {
      setFailed(true)
    } finally {
      setClearing(false)
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (clearing) return
    if (!nextOpen) setFailed(false)
    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>이 브라우저의 모든 앱 데이터를 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            PDF와 분석 데이터, 내려받은 AI 모델을 포함해 이 origin에 저장된 앱 데이터를 삭제합니다.
            복구할 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <ErrorAlert
            description="잠시 후 다시 시도해 주세요."
            title="앱 데이터를 삭제하지 못했습니다."
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearing}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={clearing}
            onClick={() => void clearData()}
            variant="destructive"
          >
            {clearing && <Spinner data-icon="inline-start" />}
            {clearing ? '삭제 중…' : failed ? '다시 시도' : '모든 데이터 삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
