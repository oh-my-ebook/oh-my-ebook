import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { focusTocPageThumbnail } from '../lib/toc-focus'
import { TocPageThumbnail } from './toc-page-thumbnail'

const TOC_TITLE = '목차'
const CLOSE_BUTTON_LABEL = '목차 닫기'
const CURRENT_PAGE_SELECTOR = '[aria-current="page"]'

interface ReaderTocProps {
  currentPage: number
  document: PdfDocumentHandle | null
  isWideScreen: boolean
  nextPage: number | null
  onOpenChange: (open: boolean) => void
  onPageChange: (pageNumber: number) => void
  open: boolean
  openButtonRef: RefObject<HTMLButtonElement | null>
  pages: readonly PdfPageInfo[]
  previousPage: number | null
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

// 넓은 화면에서는 헤더 없이 툴바의 목차 버튼으로만 여닫는다. 열리면 바로 화살표 키로 페이지를
// 넘길 수 있도록, 포커스를 여는 버튼 대신 현재 페이지 썸네일로 옮긴다.
function WideReaderToc({ currentPage, document, onPageChange, open, pages }: TocSectionProps) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open) {
      asideRef.current?.querySelector<HTMLElement>(CURRENT_PAGE_SELECTOR)?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  return (
    <aside
      aria-label={TOC_TITLE}
      className="flex w-70 shrink-0 flex-col border-r bg-card"
      ref={asideRef}
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

// Sheet는 모달이라 열려 있는 동안 키보드 이벤트가 document까지 전달되지 않으므로,
// 위아래 화살표로 페이지를 넘기는 동작은 Sheet 안에서 직접 처리한다.
function handleTocKeyDown(
  event: KeyboardEvent,
  previousPage: number | null,
  nextPage: number | null,
  onPageChange: (pageNumber: number) => void,
) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return
  }

  const targetPage =
    event.key === 'ArrowUp' ? previousPage : event.key === 'ArrowDown' ? nextPage : undefined
  if (targetPage === undefined) {
    return
  }

  event.preventDefault()
  if (targetPage !== null) {
    onPageChange(targetPage)
    focusTocPageThumbnail(event.currentTarget, targetPage)
  }
}

function NarrowReaderToc({
  currentPage,
  document,
  nextPage,
  onOpenChange,
  onPageChange,
  open,
  openButtonRef,
  pages,
  previousPage,
}: TocSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-label={TOC_TITLE}
        finalFocus={openButtonRef}
        initialFocus={() =>
          contentRef.current?.querySelector<HTMLElement>(CURRENT_PAGE_SELECTOR) ?? null
        }
        onKeyDown={(event) => handleTocKeyDown(event, previousPage, nextPage, onPageChange)}
        ref={contentRef}
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
