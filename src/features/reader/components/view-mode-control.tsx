import { BookOpenIcon, FileIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { toast } from '@/components/ui/toast'
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
  // const wasSpreadAvailable = useRef(isSpreadAvailable)

  useEffect(() => {
    if (preferredView === 'spread' && !isSpreadAvailable) {
      toast.add({ title: '화면이 좁아 한 페이지로 표시합니다.' })
    }
  }, [isSpreadAvailable, preferredView])

  const handleValueChange = (value: string[]) => {
    const nextView = value[0]

    if (nextView === 'single' || nextView === 'spread') {
      onViewChange(nextView)
    }
  }

  return (
    <ToggleGroup
      aria-label="보기 방식"
      onValueChange={handleValueChange}
      size="sm"
      spacing={0}
      value={[isSpreadAvailable ? preferredView : 'single']}
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
            <ToggleGroupItem aria-label="두 페이지" disabled={!isSpreadAvailable} value="spread" />
          }
        >
          <BookOpenIcon />
        </TooltipTrigger>
        <TooltipContent>두 페이지</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  )
}
