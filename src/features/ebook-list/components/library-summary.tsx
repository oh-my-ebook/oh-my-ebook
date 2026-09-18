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
    <dl aria-label="서재 현황" className="library-summary" role="group">
      <div>
        <dt>소장 도서 </dt>
        <dd>
          <span>{books.length}권</span>
          <span
            aria-label={`브라우저 저장소 사용량(추정) ${usageText}`}
            className="library-summary-usage"
          >
            {' '}
            ({usageText})
          </span>
        </dd>
      </div>
      <Separator orientation="vertical" />
      <div>
        <dt>읽는 중 </dt>
        <dd>{readingCount}</dd>
      </div>
      <Separator orientation="vertical" />
      <div>
        <dt>완독 </dt>
        <dd>{completedCount}</dd>
      </div>
    </dl>
  )
}
