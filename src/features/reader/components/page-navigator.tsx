import { useState } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getSinglePageNavigation } from '../lib/page-navigation'

interface PageNavigatorProps {
  currentPage: number
  disabled?: boolean
  onPageChange: (pageNumber: number) => void
  totalPages: number
}

interface PageNavigationButtonProps {
  disabled: boolean
  icon: LucideIcon
  label: string
  onPageChange: (pageNumber: number) => void
  targetPage: number | null
}

function getPageNumber(value: number | readonly number[]) {
  return Array.isArray(value) ? value[0] : value
}

function PageNavigationButton({
  disabled,
  icon: Icon,
  label,
  onPageChange,
  targetPage,
}: PageNavigationButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            disabled={disabled || targetPage === null}
            onClick={() => {
              if (targetPage !== null) {
                onPageChange(targetPage)
              }
            }}
            size="icon"
            variant="ghost"
          />
        }
      >
        <Icon data-icon="inline-start" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function PageNavigator({
  currentPage,
  disabled = false,
  onPageChange,
  totalPages,
}: PageNavigatorProps) {
  const [previewPage, setPreviewPage] = useState<number | null>(null)
  const sliderPage = previewPage ?? currentPage
  const navigation = getSinglePageNavigation(currentPage, totalPages)

  return (
    <TooltipProvider>
      <nav aria-label="페이지 탐색" className="flex w-full min-w-0 items-center gap-1">
        <PageNavigationButton
          disabled={disabled}
          icon={ChevronsLeftIcon}
          label="첫 페이지"
          onPageChange={onPageChange}
          targetPage={navigation.firstPage}
        />
        <PageNavigationButton
          disabled={disabled}
          icon={ChevronLeftIcon}
          label="이전 페이지"
          onPageChange={onPageChange}
          targetPage={navigation.previousPage}
        />

        <output
          aria-label="페이지 위치"
          aria-live="polite"
          className="w-6 shrink-0 text-center tabular-nums"
        >
          {sliderPage}
          <span className="sr-only"> / {totalPages}</span>
        </output>
        <Slider
          className="min-w-0 flex-1 px-2 [&_[data-slot=slider-thumb]]:bg-primary"
          disabled={disabled || totalPages === 1}
          getAriaLabel={() => '페이지 슬라이더'}
          getAriaValueText={(_formattedValue, pageNumber) => `${pageNumber} / ${totalPages}페이지`}
          max={totalPages}
          min={totalPages === 1 ? 0 : 1}
          onValueChange={(pageNumbers) => {
            const pageNumber = getPageNumber(pageNumbers)
            if (typeof pageNumber === 'number') {
              setPreviewPage(pageNumber)
            }
          }}
          onValueCommitted={(pageNumbers) => {
            setPreviewPage(null)
            const pageNumber = getPageNumber(pageNumbers)
            if (
              typeof pageNumber !== 'number' ||
              !Number.isSafeInteger(pageNumber) ||
              pageNumber < 1 ||
              pageNumber > totalPages
            ) {
              return
            }

            onPageChange(pageNumber)
          }}
          step={1}
          value={[sliderPage]}
        />
        <span aria-hidden="true" className="w-6 shrink-0 text-center tabular-nums">
          {totalPages}
        </span>

        <PageNavigationButton
          disabled={disabled}
          icon={ChevronRightIcon}
          label="다음 페이지"
          onPageChange={onPageChange}
          targetPage={navigation.nextPage}
        />
        <PageNavigationButton
          disabled={disabled}
          icon={ChevronsRightIcon}
          label="마지막 페이지"
          onPageChange={onPageChange}
          targetPage={navigation.lastPage}
        />
      </nav>
    </TooltipProvider>
  )
}
