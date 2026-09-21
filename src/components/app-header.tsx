import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ThemeToggle } from '@/components/theme-toggle'

interface AppHeaderProps {
  navigationLabel: string
  children: ReactNode
}

export function AppHeader({ children, navigationLabel }: AppHeaderProps) {
  return (
    <header className="border-b bg-card/92">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-10">
        <Link
          className="flex shrink-0 items-center gap-2 text-sm font-bold"
          to="/"
          aria-label="oh-my-ebook 홈"
        >
          <img
            className="rounded-lg"
            src="/landing/logo.jpg"
            alt="oh-my-ebook"
            width="32"
            height="32"
          />
          <span className="max-[420px]:sr-only">oh-my-ebook</span>
        </Link>
        <nav
          aria-label={navigationLabel}
          className="ml-auto flex min-w-0 items-center justify-end gap-4"
        >
          {children}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
