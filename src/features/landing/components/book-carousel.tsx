import { useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const books = [
  { title: '운영체제의 기초', cover: 'operating-systems' },
  { title: '그림으로 배우는 자료구조', cover: 'data-structures' },
  { title: '네트워크 첫걸음', cover: 'networks' },
  { title: '데이터베이스 설계', cover: 'databases' },
  { title: '선형대수 노트', cover: 'linear-algebra' },
]

export function BookCarousel() {
  const [active, setActive] = useState(0)

  return (
    <section className="landing-books" aria-label="직접 만든 책 표지">
      <div className="landing-book-stage" aria-hidden="true">
        {books.map((book, index) => {
          const offset = ((active - index + books.length + 2) % books.length) - 2
          return (
            <div
              className="landing-book"
              key={book.cover}
              style={{
                transform: `translateX(calc(-50% + ${offset} * var(--book-spread))) translateY(${Math.abs(offset) * 17}px) translateZ(${-Math.abs(offset) * 65}px) rotateY(${offset === 0 ? -12 : offset < 0 ? 32 : -32}deg) rotateZ(${offset * 2}deg)`,
                zIndex: 5 - Math.abs(offset),
              }}
            >
              <img src={`/landing/${book.cover}.svg`} alt="" width="310" height="450" />
            </div>
          )
        })}
      </div>
      <div className="landing-book-controls">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="이전 책"
          onClick={() => setActive((active + books.length - 1) % books.length)}
        >
          <ArrowLeft />
        </Button>
        <p role="status" className="landing-caption">
          {books[active].title} <span aria-hidden="true">·</span> {active + 1} / {books.length}
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="다음 책"
          onClick={() => setActive((active + 1) % books.length)}
        >
          <ArrowRight />
        </Button>
      </div>
    </section>
  )
}
