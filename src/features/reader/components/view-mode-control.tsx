import { BookOpenIcon, FileIcon } from 'lucide-react'
import { useEffect } from 'react'

import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { PageViewMode } from '../lib/page-spread'

// 트랙(radius-md, 패딩 2px) 안의 항목이라 모서리를 한 단계 줄이고, 선택 항목은 shadcn Tabs처럼 트랙 위에 떠 보이게 한다.
const SEGMENT_ITEM_CLASS_NAME =
  "h-7 w-8 min-w-0 rounded-sm border border-transparent px-0 text-muted-foreground hover:bg-transparent hover:text-foreground data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-sm dark:data-pressed:border-input dark:data-pressed:bg-input/30 [&_svg:not([class*='size-'])]:size-4"

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
      className="bg-muted p-0.5"
      onValueChange={handleValueChange}
      size="sm"
      spacing={0.5}
      value={[isSpreadAvailable ? preferredView : 'single']}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem
              aria-label="한 페이지"
              className={SEGMENT_ITEM_CLASS_NAME}
              value="single"
            />
          }
        >
          <FileIcon />
        </TooltipTrigger>
        <TooltipContent>한 페이지</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem
              aria-label="두 페이지"
              className={SEGMENT_ITEM_CLASS_NAME}
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
  )
}
