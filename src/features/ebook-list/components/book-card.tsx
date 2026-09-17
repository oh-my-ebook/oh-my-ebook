import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { StoredBook } from '../ebook-types'

interface BookCardProps {
  book: StoredBook
  onOpen(): void
}

export function BookCard({ book, onOpen }: BookCardProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const progress =
    book.last_page === null
      ? `읽지 않음 · 전체 ${book.page_count}페이지`
      : `${book.last_page} / ${book.page_count}페이지`

  useEffect(() => {
    if (!book.cover_data || !book.cover_mime) return
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(book.cover_data)], { type: book.cover_mime }),
    )
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [book.cover_data, book.cover_mime])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate" title={book.title}>
          {book.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {book.cover_data && book.cover_mime ? (
          <img ref={imageRef} alt={`${book.title} 표지`} className="max-h-64 object-contain" />
        ) : (
          <p>기본 표지</p>
        )}
        <p>{progress}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={onOpen}>책 열기</Button>
      </CardFooter>
    </Card>
  )
}
