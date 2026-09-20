import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme(theme: Theme): void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('ThemeProvider 안에서 테마를 사용해야 합니다.')
  return context
}
