import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { cn } from 'cn'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface ErrorAlertProps {
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}

export function ErrorAlert({ title, description, children, className }: ErrorAlertProps) {
  return (
    <Alert className={cn('flex items-start gap-3 p-4', className)} variant="destructive">
      <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-destructive/15">
        <TriangleAlert className="size-4.5" />
      </span>
      <div className="flex flex-col gap-1">
        <AlertTitle className="text-sm font-semibold text-foreground">{title}</AlertTitle>
        {(description || children) && (
          <AlertDescription>
            {description}
            {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
          </AlertDescription>
        )}
      </div>
    </Alert>
  )
}
