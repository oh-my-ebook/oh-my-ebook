import { useState } from 'react'
import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggleTheme() {
    setDark(document.documentElement.classList.toggle('dark'))
  }

  return (
    <Button
      aria-label={dark ? '밝은 테마' : '어두운 테마'}
      onClick={toggleTheme}
      size="icon-sm"
      variant="ghost"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
