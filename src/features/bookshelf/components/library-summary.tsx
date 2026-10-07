import { Separator } from '@/components/ui/separator'
import type { StoredBook } from '../ebook-types'
import { formatBytes } from '../lib/format-bytes'

interface LibrarySummaryProps {
  books: StoredBook[]
  usage: number | null
}

export function LibrarySummary({ books, usage }: LibrarySummaryProps) {
  const readingCount = books.filter(
    (book) => book.last_page !== null && book.last_page < book.page_count,
  ).length
  const completedCount = books.filter((book) => book.last_page === book.page_count).length
  const usageText = usage === null ? '확인 불가' : formatBytes(usage)

  return (
    <dl
      aria-label="서재 현황"
      className="flex h-8 items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground"
      role="group"
    >
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <dt className="font-bold text-foreground">소장 도서 </dt>
        <dd className="flex items-baseline text-foreground">
          <span>{books.length}권</span>
          <span
            aria-label={`브라우저 저장소 사용량(추정) ${usageText}`}
            className="text-[0.6875rem] text-muted-foreground"
          >
            {' '}
            ({usageText})
          </span>
        </dd>
      </div>
      <Separator orientation="vertical" />
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <dt className="font-bold text-foreground">읽는 중 </dt>
        <dd className="flex items-baseline text-foreground">{readingCount}</dd>
      </div>
      <Separator orientation="vertical" />
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <dt className="font-bold text-foreground">완독 </dt>
        <dd className="flex items-baseline text-foreground">{completedCount}</dd>
      </div>
    </dl>
  )
}
