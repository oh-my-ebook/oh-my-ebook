import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface ReaderToolbarProps {
  title: string
}

export function ReaderToolbar({ title }: ReaderToolbarProps) {
  return (
    <TooltipProvider>
      <header className="flex min-h-12 min-w-0 shrink-0 items-center border-b px-4 py-2">
        <Tooltip>
          <TooltipTrigger
            render={<h1 className="min-w-0 flex-1 truncate text-left" tabIndex={0} />}
          >
            {title}
          </TooltipTrigger>
          <TooltipContent>{title}</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  )
}
