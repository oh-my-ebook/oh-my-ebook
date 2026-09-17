import { Skeleton } from '@/components/ui/skeleton'

const SKELETON_BOOK_COUNT = 5

export function EbookShelfLoading() {
  return (
    <section aria-label="책장 불러오기" className="flex flex-col gap-5">
      <div aria-label="책장 불러오는 중" className="flex flex-col gap-1" role="status">
        <p className="font-heading font-medium">서재를 불러오고 있습니다.</p>
        <p className="text-sm text-muted-foreground">책 표지를 준비하고 있어요.</p>
      </div>
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
