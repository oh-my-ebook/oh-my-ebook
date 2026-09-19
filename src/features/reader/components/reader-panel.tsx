import { useEffect, useRef, type RefObject } from 'react'
import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { BookMetadata } from '../lib/book-metadata'
import { ReaderChat } from './reader-chat'

const PANEL_TITLE = '함께 읽기'
const CLOSE_BUTTON_LABEL = '함께 읽기 패널 닫기'
const RESIZE_HANDLE_LABEL = '함께 읽기 패널 너비 조절'

interface ReaderPanelProps {
  bookMetadata?: BookMetadata
  chatSessionKey?: string
  currentPage?: number
  currentPageText: string | null
  isWideScreen: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
  openButtonRef: RefObject<HTMLButtonElement | null>
}

type PanelSectionProps = Omit<ReaderPanelProps, 'isWideScreen'>

function WideReaderPanel({
  bookMetadata,
  chatSessionKey,
  currentPage,
  currentPageText,
  onOpenChange,
  open,
  openButtonRef,
}: PanelSectionProps) {
  // 패널을 열면 채팅 입력창이 포커스를 가져가므로, 닫을 때 열기 버튼으로 되돌리지 않으면
  // 포커스가 사라진다.
  const wasOpenRef = useRef(open)
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      openButtonRef.current?.focus()
    }
    wasOpenRef.current = open
  }, [open, openButtonRef])

  // 열려 있을 때 포커스 위치와 무관하게 Escape로 닫을 수 있어야 하므로 문서 전체에서 관찰한다.
  // Resizable은 Dialog와 달리 포커스를 가두지 않아 패널 밖(예: 열기 버튼)에 포커스가 있을 수 있다.
  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

  if (!open) {
    return null
  }

  return (
    <>
      <ResizableHandle
        aria-label={RESIZE_HANDLE_LABEL}
        className="data-[separator=active]:bg-primary/40 data-[separator=active]:ring-[1.5px] data-[separator=active]:ring-primary/15 data-[separator=hover]:bg-primary/40 data-[separator=hover]:ring-[1.5px] data-[separator=hover]:ring-primary/15"
      />
      <ResizablePanel defaultSize="30%" id="reader-chat" maxSize="45%" minSize="360px">
        <aside
          aria-label={PANEL_TITLE}
          className="flex h-full min-w-0 flex-col bg-card"
          role="region"
        >
          <div className="min-h-0 flex-1">
            <ReaderChat
              bookMetadata={bookMetadata}
              currentPage={currentPage}
              currentPageText={currentPageText}
              key={chatSessionKey}
            />
          </div>
        </aside>
      </ResizablePanel>
    </>
  )
}

function NarrowReaderPanel({
  bookMetadata,
  chatSessionKey,
  currentPage,
  currentPageText,
  onOpenChange,
  open,
  openButtonRef,
}: PanelSectionProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent aria-label={PANEL_TITLE} finalFocus={openButtonRef} showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>{PANEL_TITLE}</SheetTitle>
          <SheetClose
            render={<Button aria-label={CLOSE_BUTTON_LABEL} size="icon-sm" variant="ghost" />}
          >
            <XIcon />
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <ReaderChat
            bookMetadata={bookMetadata}
            currentPage={currentPage}
            currentPageText={currentPageText}
            key={chatSessionKey}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ReaderPanel({ isWideScreen, ...panelProps }: ReaderPanelProps) {
  return isWideScreen ? <WideReaderPanel {...panelProps} /> : <NarrowReaderPanel {...panelProps} />
}
