import type { RefObject } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { TocPageThumbnail } from './toc-page-thumbnail'

const TOC_TITLE = '목차'
const CLOSE_BUTTON_LABEL = '목차 닫기'

interface ReaderTocProps {
  currentPage: number
  document: PdfDocumentHandle | null
  isWideScreen: boolean
  onOpenChange: (open: boolean) => void
  onPageChange: (pageNumber: number) => void
  open: boolean
  openButtonRef: RefObject<HTMLButtonElement | null>
  pages: readonly PdfPageInfo[]
}

type TocSectionProps = Omit<ReaderTocProps, 'isWideScreen'>

type TocListProps = Pick<ReaderTocProps, 'currentPage' | 'document' | 'onPageChange' | 'pages'>

function TocThumbnailList({ currentPage, document, onPageChange, pages }: TocListProps) {
  if (!document) {
    return null
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-1 p-2">
        {pages.map((page) => (
          <TocPageThumbnail
            document={document}
            isCurrent={page.pageNumber === currentPage}
            key={page.pageNumber}
            onSelect={onPageChange}
            page={page}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

// 넓은 화면에서는 헤더 없이 툴바의 목차 버튼으로만 여닫으므로 포커스는 그 버튼에 그대로 남는다.
function WideReaderToc({ currentPage, document, onPageChange, open, pages }: TocSectionProps) {
  if (!open) {
    return null
  }

  return (
    <aside
      aria-label={TOC_TITLE}
      className="flex w-70 shrink-0 flex-col border-r bg-card"
      role="region"
    >
      <TocThumbnailList
        currentPage={currentPage}
        document={document}
        onPageChange={onPageChange}
        pages={pages}
      />
    </aside>
  )
}

function NarrowReaderToc({
  currentPage,
  document,
  onOpenChange,
  onPageChange,
  open,
  openButtonRef,
  pages,
}: TocSectionProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-label={TOC_TITLE}
        finalFocus={openButtonRef}
        showCloseButton={false}
        side="left"
      >
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>{TOC_TITLE}</SheetTitle>
          <SheetClose
            render={<Button aria-label={CLOSE_BUTTON_LABEL} size="icon-sm" variant="ghost" />}
          >
            <XIcon />
          </SheetClose>
        </SheetHeader>
        <TocThumbnailList
          currentPage={currentPage}
          document={document}
          onPageChange={onPageChange}
          pages={pages}
        />
      </SheetContent>
    </Sheet>
  )
}

export function ReaderToc({ isWideScreen, ...tocProps }: ReaderTocProps) {
  return isWideScreen ? <WideReaderToc {...tocProps} /> : <NarrowReaderToc {...tocProps} />
}
