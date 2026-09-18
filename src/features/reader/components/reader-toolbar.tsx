import { useState, type RefObject } from 'react'
import {
  ArrowLeftIcon,
  BookmarkIcon,
  ListIcon,
  MoonIcon,
  PanelRightIcon,
  SunIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { PageViewMode } from '../lib/page-spread'
import { ViewModeControl } from './view-mode-control'

interface ReaderToolbarProps {
  onTogglePanel: () => void
  panelButtonRef: RefObject<HTMLButtonElement | null>
  panelOpen: boolean
  title: string
  preferredView: PageViewMode
  isSpreadAvailable: boolean
  onViewChange: (view: PageViewMode) => void
}

export function ReaderToolbar({
  onTogglePanel,
  panelButtonRef,
  panelOpen,
  title,
  preferredView,
  isSpreadAvailable,
  onViewChange,
}: ReaderToolbarProps) {
  const [tocOpen, setTocOpen] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
    const nextDark = !dark
    document.documentElement.classList.toggle('dark', nextDark)
    setDark(nextDark)
  }

  return (
    <header
      aria-label="독서 도구"
      className="grid min-h-12 min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-3 py-2 max-sm:grid-cols-[1fr_auto]"
    >
      <div className="flex items-center gap-1">
        <Button aria-label="책장으로 돌아가기" size="icon-sm" variant="ghost">
          <ArrowLeftIcon />
        </Button>
        <Separator className="h-5" orientation="vertical" />
        <Sheet onOpenChange={setTocOpen} open={tocOpen}>
          <SheetTrigger
            render={
              <Button
                aria-label={tocOpen ? '목차 닫기' : '목차 열기'}
                aria-pressed={tocOpen}
                size="icon-sm"
                variant={tocOpen ? 'secondary' : 'ghost'}
              />
            }
          >
            <ListIcon />
          </SheetTrigger>
          <SheetContent aria-label="목차" showCloseButton={false} side="left">
            <SheetHeader className="flex-row items-center justify-between">
              <SheetTitle>목차</SheetTitle>
              <SheetClose render={<Button aria-label="목차 닫기" size="icon-sm" variant="ghost" />}>
                <XIcon />
              </SheetClose>
            </SheetHeader>
          </SheetContent>
        </Sheet>
        <Button aria-label="책갈피" size="icon-sm" variant="ghost">
          <BookmarkIcon />
        </Button>
      </div>

      <h1 className="min-w-0 truncate text-center max-sm:col-span-2 max-sm:row-start-2">{title}</h1>

      <div className="flex items-center justify-end gap-1">
        <ViewModeControl
          isSpreadAvailable={isSpreadAvailable}
          onViewChange={onViewChange}
          preferredView={preferredView}
        />
        <Separator className="h-5" orientation="vertical" />
        <Button
          aria-label={dark ? '밝은 테마' : '어두운 테마'}
          onClick={toggleTheme}
          size="icon-sm"
          variant="ghost"
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>
        <Button
          aria-label={panelOpen ? '함께 읽기 패널 닫기' : '함께 읽기 패널 열기'}
          aria-pressed={panelOpen}
          onClick={onTogglePanel}
          ref={panelButtonRef}
          size="icon-sm"
          variant={panelOpen ? 'secondary' : 'ghost'}
        >
          <PanelRightIcon />
        </Button>
      </div>
    </header>
  )
}
