import { Link } from 'react-router'
import { Separator } from '@/components/ui/separator'

export function AppFooter() {
  return (
    <footer className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-10">
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-5 py-7">
        <Link className="flex items-center gap-2 text-sm font-bold" to="/">
          <img className="rounded-lg" src="/landing/logo.jpg" alt="" width="32" height="32" />
          oh-my-ebook
        </Link>
        <nav
          aria-label="서비스 안내"
          className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"
        >
          <Link className="hover:text-foreground hover:underline" to="/privacy">
            개인정보처리방침
          </Link>
          <Link className="hover:text-foreground hover:underline" to="/terms">
            이용약관
          </Link>
          <Link className="hover:text-foreground hover:underline" to="/licenses">
            오픈소스 라이선스
          </Link>
        </nav>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        © {new Date().getFullYear()} oh-my-ebook. All rights reserved. · 표지와 체험 본문은 이
        서비스를 위해 직접 제작했습니다.
      </p>
    </footer>
  )
}
