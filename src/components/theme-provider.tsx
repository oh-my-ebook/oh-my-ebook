import { useLayoutEffect, useState, type PropsWithChildren } from 'react'
import { ThemeContext, type Theme } from '@/hooks/use-theme'

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored === 'light' || stored === 'dark') return stored
    } catch {
      // 저장소가 차단되면 시스템 설정을 따른다.
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  function changeTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      localStorage.setItem('theme', nextTheme)
    } catch {
      // 저장소가 차단되어도 현재 화면의 선택은 유지한다.
    }
  }

  return <ThemeContext value={{ theme, setTheme: changeTheme }}>{children}</ThemeContext>
}
