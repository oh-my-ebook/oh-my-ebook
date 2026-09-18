import type { RefObject } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const TOC_TITLE = '목차'
const CLOSE_BUTTON_LABEL = '목차 닫기'

interface ReaderTocProps {
  isWideScreen: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  openButtonRef: RefObject<HTMLButtonElement | null>
}

type TocSectionProps = Omit<ReaderTocProps, 'isWideScreen'>

// 넓은 화면에서는 헤더 없이 툴바의 목차 버튼으로만 여닫으므로 포커스는 그 버튼에 그대로 남는다.
function WideReaderToc({ open }: Pick<TocSectionProps, 'open'>) {
  if (!open) {
    return null
  }

  return (
    <aside
      aria-label={TOC_TITLE}
      className="flex w-70 shrink-0 flex-col border-r bg-card"
      role="region"
    />
  )
}

function NarrowReaderToc({ onOpenChange, open, openButtonRef }: TocSectionProps) {
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
      </SheetContent>
    </Sheet>
  )
}

export function ReaderToc({ isWideScreen, ...tocProps }: ReaderTocProps) {
  return isWideScreen ? <WideReaderToc open={tocProps.open} /> : <NarrowReaderToc {...tocProps} />
}
