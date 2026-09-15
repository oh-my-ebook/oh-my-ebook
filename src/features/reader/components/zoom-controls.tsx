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
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !canZoomOut}
        onClick={onZoomOut}
      >
        축소
      </Button>
      <output role="status" aria-label="현재 확대율">
        {Math.round(scale * 100)}%
      </output>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !canZoomIn}
        onClick={onZoomIn}
      >
        확대
      </Button>
      <Button
        type="button"
        variant={isFitHeight ? 'secondary' : 'outline'}
        size="sm"
        aria-pressed={isFitHeight}
        disabled={disabled}
        onClick={onFitHeight}
      >
        높이 맞춤
      </Button>
    </div>
  )
}
