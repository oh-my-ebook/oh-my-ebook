import { MinusIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ZoomControlsProps {
  isFitHeight: boolean
  scale: number
  canZoomIn: boolean
  canZoomOut: boolean
  disabled?: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFitHeight: () => void
}

export function ZoomControls({
  isFitHeight,
  scale,
  canZoomIn,
  canZoomOut,
  disabled = false,
  onZoomIn,
  onZoomOut,
  onFitHeight,
}: ZoomControlsProps) {
  return (
    <div role="group" aria-label="크기 조절" className="flex flex-wrap items-center gap-1">
      <Button
        aria-label="축소"
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !canZoomOut}
        onClick={onZoomOut}
      >
        <MinusIcon />
      </Button>
      <Button
        type="button"
        variant={isFitHeight ? 'secondary' : 'ghost'}
        size="sm"
        aria-label="높이 맞춤"
        aria-pressed={isFitHeight}
        disabled={disabled}
        onClick={onFitHeight}
      >
        <output role="status" aria-label="현재 확대율">
          {Math.round(scale * 100)}%
        </output>
      </Button>
      <Button
        aria-label="확대"
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !canZoomIn}
        onClick={onZoomIn}
      >
        <PlusIcon />
      </Button>
    </div>
  )
}
