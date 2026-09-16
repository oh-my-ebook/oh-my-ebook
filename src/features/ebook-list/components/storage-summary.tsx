import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast'
import { formatBytes } from '../lib/format-bytes'
import type { StorageCapacity } from '../lib/storage-manager'

const PERSISTENCE_REQUEST_THRESHOLD = 1024 ** 3

interface StorageSummaryProps {
  capacity: StorageCapacity | null
  persistentStorage: boolean | null
  onRetry(): void
  onRequestPersistence(): Promise<boolean>
}

export function StorageSummary({
  capacity,
  persistentStorage,
  onRetry,
  onRequestPersistence,
}: StorageSummaryProps) {
  const [requestingPersistence, setRequestingPersistence] = useState(false)

  async function requestPersistence() {
    setRequestingPersistence(true)
    try {
      if (!(await onRequestPersistence())) {
        toast.add({ title: '영구 저장 전환에 실패했습니다.', type: 'error' })
      }
    } finally {
      setRequestingPersistence(false)
    }
  }

  const canRequestPersistence =
    persistentStorage === false &&
    capacity !== null &&
    capacity.remaining <= PERSISTENCE_REQUEST_THRESHOLD

  return (
    <section aria-label="저장 공간" className="flex flex-col gap-2">
      <h2 className="font-heading font-semibold">저장 공간</h2>
      {capacity ? (
        <>
          <p>사용량 {formatBytes(capacity.usage)}</p>
          <p>예상 할당량 {formatBytes(capacity.quota)}</p>
          <p>예상 잔여량 {formatBytes(capacity.remaining)}</p>
          <Progress
            aria-label="저장 공간 사용 비율"
            value={
              capacity.quota > 0
                ? Math.min(100, Math.round((capacity.usage / capacity.quota) * 100))
                : 0
            }
          />
          <p className="text-muted-foreground">
            브라우저 추정치이며 실제 저장 가능량은 다를 수 있습니다.
          </p>
          {canRequestPersistence && (
            <Button
              disabled={requestingPersistence}
              onClick={() => {
                void requestPersistence()
              }}
              variant="outline"
            >
              {requestingPersistence ? '영구 저장 요청 중…' : '영구 저장 요청'}
            </Button>
          )}
        </>
      ) : (
        <>
          <p>저장 공간을 확인할 수 없습니다.</p>
          <Button onClick={onRetry} variant="outline">
            용량 다시 확인
          </Button>
        </>
      )}
    </section>
  )
}
