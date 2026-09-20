import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@/components/theme-provider'

export function TestRouter(props: ComponentProps<typeof MemoryRouter>) {
  return (
    <ThemeProvider>
      <MemoryRouter {...props} />
    </ThemeProvider>
  )
}
