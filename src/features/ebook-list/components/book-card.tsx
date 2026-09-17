import { useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Ellipsis, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { StoredBook } from '../ebook-types'

interface BookCardProps {
  book: StoredBook
  coverError?: string
  regenerating?: boolean
  onOpen(): void
  onRegenerate?(): void
  onRename?(title: string): void
  onDelete?(): void
}

export function BookCard({
  book,
  coverError,
  regenerating = false,
  onOpen,
  onRegenerate,
  onRename,
  onDelete,
}: BookCardProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [title, setTitle] = useState(book.title)
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
    <article aria-label={book.title} className="book-card">
      <Card className="book-card-surface h-full gap-0 bg-transparent p-0 shadow-none ring-0">
        <CardContent className="flex flex-1 flex-col gap-3 px-0">
          <button
            aria-label={`${book.title} 열기`}
            className="book-card-cover"
            onClick={onOpen}
            type="button"
          >
            {book.cover_data && book.cover_mime ? (
              <img ref={imageRef} alt={`${book.title} 표지`} className="size-full object-contain" />
            ) : (
              <p>기본 표지</p>
            )}
          </button>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="book-title-button" title={book.title}>
                {book.title}
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`${book.title} 메뉴`}
                  render={<Button size="icon-sm" variant="ghost" />}
                >
                  <Ellipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    {onRename && (
                      <DropdownMenuItem onClick={() => setEditing(true)}>
                        <Pencil />책 제목 수정
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem onClick={() => setDeleting(true)} variant="destructive">
                        <Trash2 />책 삭제
                      </DropdownMenuItem>
                    )}
                    {book.cover_status === 'fallback' && onRegenerate && (
                      <DropdownMenuItem disabled={regenerating} onClick={onRegenerate}>
                        <RefreshCw />
                        표지 다시 만들기
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Progress
              aria-label={`${book.title} 읽기 진행률`}
              value={
                book.last_page === null ? 0 : Math.round((book.last_page / book.page_count) * 100)
              }
            />
            <p className="text-sm text-muted-foreground">{progress}</p>
          </div>
          {book.cover_status === 'fallback' && onRegenerate && (
            <>
              <p>표지를 만들지 못했습니다.</p>
              {coverError && <p role="alert">{coverError}</p>}
            </>
          )}
        </CardContent>
      </Card>
      <Dialog onOpenChange={setEditing} open={editing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>책 제목 수정</DialogTitle>
            <DialogDescription>책장에 표시할 제목을 변경합니다.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`book-title-${book.id}`}>책 제목</FieldLabel>
              <Input
                id={`book-title-${book.id}`}
                onChange={(event) => setTitle(event.currentTarget.value)}
                value={title}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => setEditing(false)} variant="outline">
              취소
            </Button>
            <Button
              disabled={title.trim().length === 0}
              onClick={() => {
                onRename?.(title.trim())
                setEditing(false)
              }}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setDeleting} open={deleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 이 책을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제한 PDF와 읽기 위치는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete?.()
                setDeleting(false)
              }}
              variant="destructive"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
