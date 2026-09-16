import type { ReactNode } from 'react'

interface ReaderToolbarProps {
  children?: ReactNode
  title: string
}

export function ReaderToolbar({ children, title }: ReaderToolbarProps) {
  return (
    <header className="flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
      <h1 className="min-w-0 flex-1 truncate">{title}</h1>
      {children}
    </header>
  )
}
