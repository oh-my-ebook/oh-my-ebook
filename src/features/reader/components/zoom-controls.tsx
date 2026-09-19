import { MinusIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
      {/* 켜짐 상태를 나타내는 버튼이라 Toggle을 쓴다. 이미 맞춤 상태에서 눌러도 맞춤을 유지한다. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              aria-label="화면에 맞춤"
              disabled={disabled}
              onPressedChange={onFitHeight}
              pressed={isFitHeight}
              size="sm"
            />
          }
        >
          <output role="status" aria-label="현재 확대율">
            {Math.round(scale * 100)}%
          </output>
        </TooltipTrigger>
        <TooltipContent>화면에 맞춤</TooltipContent>
      </Tooltip>
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
