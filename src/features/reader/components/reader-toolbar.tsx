import { PanelRight } from 'lucide-react'
import type { RefObject, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface ReaderToolbarProps {
  onTogglePanel: () => void
  panelButtonRef: RefObject<HTMLButtonElement | null>
  panelOpen: boolean
  title: string
  children?: ReactNode
}

export function ReaderToolbar({
  onTogglePanel,
  panelButtonRef,
  panelOpen,
  title,
  children,
}: ReaderToolbarProps) {
  return (
    <header className="flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
      <h1 className="min-w-0 flex-1 truncate">{title}</h1>
      {children}
      <Button
        aria-label={panelOpen ? '보조 패널 닫기' : '보조 패널 열기'}
        aria-pressed={panelOpen}
        onClick={onTogglePanel}
        ref={panelButtonRef}
        size="icon-sm"
        variant={panelOpen ? 'secondary' : 'ghost'}
      >
        <PanelRight />
      </Button>
    </header>
  )
}
