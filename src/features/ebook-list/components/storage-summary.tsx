import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toast'
import type { StoredBook } from '../ebook-types'
import { formatBytes } from '../lib/format-bytes'
import type { StorageCapacity } from '../lib/storage-manager'

const PERSISTENCE_REQUEST_THRESHOLD = 1024 ** 3

interface StorageSummaryProps {
  books: readonly StoredBook[]
  capacity: StorageCapacity | null
  persistentStorage: boolean | null
  onRetry(): void
  onRequestPersistence(): Promise<boolean>
}

export function StorageSummary({
  books,
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
  const usagePercentage =
    capacity && capacity.quota > 0
      ? Math.min(100, Math.round((capacity.usage / capacity.quota) * 100))
      : 0
  const readingBooks = books.filter(
    (book) => book.last_page !== null && book.last_page < book.page_count,
  ).length
  const completedBooks = books.filter(
    (book) => book.last_page !== null && book.last_page >= book.page_count,
  ).length

  return (
    <Card aria-label="저장 공간" className="storage-summary">
      <CardHeader>
        <CardTitle>로컬 브라우저 용량</CardTitle>
        <CardDescription>이 브라우저에 저장된 PDF의 공간 사용량입니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {capacity ? (
            <>
              <p className="text-sm tabular-nums">
                사용 중 {formatBytes(capacity.usage)} / {formatBytes(capacity.quota)}
              </p>
              <Progress aria-label="저장 공간 사용 비율" value={usagePercentage}>
                <ProgressLabel>저장 공간 사용량</ProgressLabel>
                <ProgressValue />
              </Progress>
              <p className="text-sm text-muted-foreground">
                남은 용량 {formatBytes(capacity.remaining)}
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
              <p className="text-sm text-muted-foreground">저장 공간을 확인할 수 없습니다.</p>
              <Button onClick={onRetry} variant="outline">
                용량 다시 확인
              </Button>
            </>
          )}
        </div>
        <Separator className="hidden lg:block" orientation="vertical" />
        <dl className="grid flex-1 grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">저장된 도서</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{books.length}권</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">읽는 중</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{readingBooks}권</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">완독</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{completedBooks}권</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
