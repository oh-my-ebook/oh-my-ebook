import type { PageViewMode } from '../lib/page-spread'
import { ViewModeControl } from './view-mode-control'

interface ReaderToolbarProps {
  title: string
  preferredView: PageViewMode
  isSpreadAvailable: boolean
  onViewChange: (view: PageViewMode) => void
}

export function ReaderToolbar({
  title,
  preferredView,
  isSpreadAvailable,
  onViewChange,
}: ReaderToolbarProps) {
  return (
    <header className="flex min-h-12 min-w-0 shrink-0 items-center gap-4 border-b px-4 py-2">
      <h1 className="min-w-0 flex-1 truncate">{title}</h1>
      <ViewModeControl
        isSpreadAvailable={isSpreadAvailable}
        onViewChange={onViewChange}
        preferredView={preferredView}
      />
    </header>
  )
}
