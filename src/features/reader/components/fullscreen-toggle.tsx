import { useEffect, useState } from 'react'
import { MaximizeIcon, MinimizeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  // Esc처럼 브라우저가 전체 화면을 끝내는 경우도 버튼 상태에 반영한다.
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleChange)
    }
  }, [])

  if (!document.fullscreenEnabled) {
    return null
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // 요청이 거부되면 fullscreenchange가 오지 않아 버튼 상태도 그대로이므로 되돌릴 것이 없다.
    }
  }

  return (
    <Button
      aria-label={isFullscreen ? '전체 화면 종료' : '전체 화면'}
      aria-pressed={isFullscreen}
      onClick={toggleFullscreen}
      size="icon-sm"
      variant="ghost"
    >
      {isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
    </Button>
  )
}
