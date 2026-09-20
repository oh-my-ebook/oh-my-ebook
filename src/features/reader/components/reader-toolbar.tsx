import type { RefObject } from 'react'
import { ArrowLeftIcon, BookmarkIcon, ListIcon, PanelRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import type { PageViewMode } from '../lib/page-spread'
import { FullscreenToggle } from './fullscreen-toggle'
import { ViewModeControl } from './view-mode-control'
import { useNavigate } from 'react-router'

interface ReaderToolbarProps {
  onToggleToc: () => void
  tocButtonRef: RefObject<HTMLButtonElement | null>
  tocOpen: boolean
  onTogglePanel: () => void
  panelButtonRef: RefObject<HTMLButtonElement | null>
  panelOpen: boolean
  title: string
  preferredView: PageViewMode
  isSpreadAvailable: boolean
  onViewChange: (view: PageViewMode) => void
}

export function ReaderToolbar({
  onToggleToc,
  tocButtonRef,
  tocOpen,
  onTogglePanel,
  panelButtonRef,
  panelOpen,
  title,
  preferredView,
  isSpreadAvailable,
  onViewChange,
}: ReaderToolbarProps) {
  const navigation = useNavigate()

  return (
    <header
      aria-label="독서 도구"
      className="grid min-h-12 min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b bg-card px-3 py-2 max-sm:grid-cols-[1fr_auto]"
    >
      <div className="flex items-center gap-1">
        <Button
          aria-label="책장으로 돌아가기"
          onClick={() => navigation('/library')}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        <Separator
          className="h-5 data-vertical:w-[1.5px] data-vertical:self-center"
          orientation="vertical"
        />
        <Button
          aria-label={tocOpen ? '목차 닫기' : '목차 열기'}
          aria-pressed={tocOpen}
          onClick={onToggleToc}
          ref={tocButtonRef}
          size="icon-sm"
          variant={tocOpen ? 'secondary' : 'ghost'}
        >
          <ListIcon />
        </Button>
        <Button aria-label="책갈피" size="icon-sm" variant="ghost">
          <BookmarkIcon />
        </Button>
      </div>

      <h1 className="min-w-0 truncate text-center font-medium max-sm:col-span-2 max-sm:row-start-2">
        {title}
      </h1>

      <div className="flex items-center justify-end gap-1">
        <ViewModeControl
          isSpreadAvailable={isSpreadAvailable}
          onViewChange={onViewChange}
          preferredView={preferredView}
        />
        <FullscreenToggle />
        <Separator
          className="h-5 data-vertical:w-[1.5px] data-vertical:self-center"
          orientation="vertical"
        />
        <ThemeToggle />
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
