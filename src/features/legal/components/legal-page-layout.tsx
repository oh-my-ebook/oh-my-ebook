import type { ReactNode } from 'react'

interface LegalPageLayoutProps {
  title: string
  description?: string
  children: ReactNode
}

export function LegalPageLayout({ title, description, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-1 border-b pb-6">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </header>
        <div className="flex flex-col gap-6 text-sm leading-relaxed">{children}</div>
      </div>
    </main>
  )
}
