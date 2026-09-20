import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환'

  return (
    <Button
      aria-label={label}
      title={label}
      size="icon-sm"
      variant="ghost"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
