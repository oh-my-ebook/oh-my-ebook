import { BookOpenIcon, FileIcon } from 'lucide-react'
import { useId } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { PageViewMode } from '../lib/page-spread'

interface ViewModeControlProps {
  preferredView: PageViewMode
  isSpreadAvailable: boolean
  onViewChange: (view: PageViewMode) => void
}

export function ViewModeControl({
  preferredView,
  isSpreadAvailable,
  onViewChange,
}: ViewModeControlProps) {
  const restrictionId = useId()
  const handleValueChange = (value: string[]) => {
    const nextView = value[0]

    if (nextView === 'single' || nextView === 'spread') {
      onViewChange(nextView)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <ToggleGroup
        aria-label="보기 방식"
        onValueChange={handleValueChange}
        size="sm"
        spacing={0}
        value={[preferredView]}
        variant="outline"
      >
        <Tooltip>
          <TooltipTrigger render={<ToggleGroupItem aria-label="한 페이지" value="single" />}>
            <FileIcon />
          </TooltipTrigger>
          <TooltipContent>한 페이지</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <ToggleGroupItem
                aria-describedby={isSpreadAvailable ? undefined : restrictionId}
                aria-label="두 페이지"
                disabled={!isSpreadAvailable}
                value="spread"
              />
            }
          >
            <BookOpenIcon />
          </TooltipTrigger>
          <TooltipContent>두 페이지</TooltipContent>
        </Tooltip>
      </ToggleGroup>
      {!isSpreadAvailable && (
        <p className="text-muted-foreground text-xs" id={restrictionId}>
          두 페이지 보기는 화면 폭 1024px 이상, 읽기 영역 1000px 이상에서 사용할 수 있습니다.
        </p>
      )}
    </div>
  )
}
