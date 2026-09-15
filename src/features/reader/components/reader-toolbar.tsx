interface ReaderToolbarProps {
  title: string
}

export function ReaderToolbar({ title }: ReaderToolbarProps) {
  return (
    <header className="flex min-h-12 min-w-0 shrink-0 items-center border-b px-4 py-2">
      <h1 className="min-w-0 flex-1 truncate">{title}</h1>
    </header>
  )
}
