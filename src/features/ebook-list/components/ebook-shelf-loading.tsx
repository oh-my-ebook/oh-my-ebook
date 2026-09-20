import { Skeleton } from '@/components/ui/skeleton'

const SKELETON_BOOK_COUNT = 5

export function EbookShelfLoading() {
  return (
    <section aria-label="책장 불러오는 중" role="status">
      <span className="sr-only">책장을 불러오는 중입니다.</span>
      <ul aria-hidden="true" className="ebook-shelf">
        {Array.from({ length: SKELETON_BOOK_COUNT }, (_, index) => (
          <li className="flex flex-col gap-3" key={index}>
            <Skeleton className="aspect-[2/3] w-full rounded-reader-page" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </li>
        ))}
      </ul>
    </section>
  )
}
