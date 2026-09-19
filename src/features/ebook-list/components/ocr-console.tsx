import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { OcrLinePage, OcrLineRecord, OcrPageRecord } from '../ebook-types'
import type { EbookLibraryStore } from '../lib/ebook-library-store'

const BOOKS_PER_PAGE = 10
const LINES_PER_PAGE = 50

interface ConsoleBook {
  id: string
  title: string
}

function isConsoleBook(value: unknown): value is ConsoleBook {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('title' in value) || typeof value.title !== 'string') return false
  return true
}

function isOcrLineRecord(value: unknown): value is OcrLineRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('line_index' in value) || typeof value.line_index !== 'number') return false
  if (!('raw_text' in value) || typeof value.raw_text !== 'string') return false
  if (!('x0' in value) || typeof value.x0 !== 'number') return false
  if (!('y0' in value) || typeof value.y0 !== 'number') return false
  if (!('x1' in value) || typeof value.x1 !== 'number') return false
  if (!('y1' in value) || typeof value.y1 !== 'number') return false
  return true
}

function isOcrLinePage(value: unknown): value is OcrLinePage {
  if (typeof value !== 'object' || value === null) return false
  if (!('total' in value) || typeof value.total !== 'number') return false
  if (!('lines' in value) || !Array.isArray(value.lines)) return false
  return value.lines.every(isOcrLineRecord)
}

function isOcrPageStatus(value: unknown): value is OcrPageRecord['status'] {
  return value === 'pending' || value === 'processing' || value === 'ready' || value === 'failed'
}

function isOcrPageRecord(value: unknown): value is OcrPageRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('status' in value) || !isOcrPageStatus(value.status)) return false
  if (!('width' in value) || !(value.width === null || typeof value.width === 'number'))
    return false
  if (!('height' in value) || !(value.height === null || typeof value.height === 'number'))
    return false
  return true
}

function PageControls({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange(page: number): void
}) {
  if (pageCount <= 1) return null

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={page === 0}
            href="#"
            onClick={(event) => {
              event.preventDefault()
              if (page > 0) onPageChange(page - 1)
            }}
            text="이전"
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-2 text-sm text-muted-foreground">
            {page + 1} / {pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            aria-disabled={page + 1 === pageCount}
            href="#"
            onClick={(event) => {
              event.preventDefault()
              if (page + 1 < pageCount) onPageChange(page + 1)
            }}
            text="다음"
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

export function OcrConsole({ store }: { store: EbookLibraryStore }) {
  const [books, setBooks] = useState<ConsoleBook[]>([])
  const [bookPage, setBookPage] = useState(0)
  const [selectedBook, setSelectedBook] = useState<ConsoleBook | null>(null)
  const [linePage, setLinePage] = useState(0)
  const [ocrPage, setOcrPage] = useState<OcrLinePage | null>(null)
  const [ocrPages, setOcrPages] = useState<OcrPageRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadBooks() {
      try {
        const result = await store.request('listBooks')
        if (!Array.isArray(result) || !result.every(isConsoleBook)) throw new Error('Invalid books')
        setBooks(result)
      } catch {
        setError('저장된 PDF 목록을 불러오지 못했습니다.')
      }
    }

    void loadBooks()
  }, [store])

  useEffect(() => {
    if (!selectedBook) return
    const book = selectedBook

    async function loadOcrData() {
      try {
        const [lineResult, pageResult] = await Promise.all([
          store.request('listOcrLines', {
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: linePage * LINES_PER_PAGE,
          }),
          store.request('listOcrPages', book.id),
        ])
        if (!isOcrLinePage(lineResult)) throw new Error('Invalid OCR lines')
        if (!Array.isArray(pageResult) || !pageResult.every(isOcrPageRecord)) {
          throw new Error('Invalid OCR pages')
        }
        setOcrPage(lineResult)
        setOcrPages(pageResult)
      } catch {
        setError('OCR 저장 내용을 불러오지 못했습니다.')
      }
    }

    void loadOcrData()
  }, [linePage, selectedBook, store])

  const visibleBooks = books.slice(bookPage * BOOKS_PER_PAGE, (bookPage + 1) * BOOKS_PER_PAGE)
  const bookPageCount = Math.ceil(books.length / BOOKS_PER_PAGE)
  const linePageCount = ocrPage ? Math.ceil(ocrPage.total / LINES_PER_PAGE) : 0

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">OCR Console</h1>
        <p className="text-muted-foreground">
          브라우저 SQLite에 저장된 PDF와 OCR 원문을 확인합니다.
        </p>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>조회 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>저장된 PDF</CardTitle>
          <CardDescription>{books.length}권</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {visibleBooks.map((book) => (
            <Button
              key={book.id}
              onClick={() => {
                setSelectedBook(book)
                setLinePage(0)
                setOcrPage(null)
                setOcrPages([])
              }}
              variant="outline"
            >
              {book.title}
            </Button>
          ))}
          <PageControls page={bookPage} pageCount={bookPageCount} onPageChange={setBookPage} />
        </CardContent>
      </Card>
      {selectedBook && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedBook.title}</CardTitle>
            <CardDescription>OCR 줄 {ocrPage?.total ?? 0}개</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
            <Card className="min-w-0" size="sm">
              <CardHeader>
                <CardTitle>페이지 상태</CardTitle>
                <CardDescription>페이지별 OCR 처리 결과</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>페이지</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>렌더 크기</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ocrPages.map((page) => (
                      <TableRow key={page.page_number}>
                        <TableCell>{page.page_number}</TableCell>
                        <TableCell>{page.status}</TableCell>
                        <TableCell>
                          {page.width === null || page.height === null
                            ? '-'
                            : `${page.width} × ${page.height}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="min-w-0" size="sm">
              <CardHeader>
                <CardTitle>OCR 줄</CardTitle>
                <CardDescription>저장된 OCR 원문과 좌표</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>페이지</TableHead>
                      <TableHead>줄</TableHead>
                      <TableHead>원문</TableHead>
                      <TableHead>bbox</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ocrPage?.lines.map((line) => (
                      <TableRow key={`${line.page_number}-${line.line_index}`}>
                        <TableCell>{line.page_number}</TableCell>
                        <TableCell>{line.line_index}</TableCell>
                        <TableCell className="whitespace-normal">{line.raw_text}</TableCell>
                        <TableCell>{`${line.x0}, ${line.y0}, ${line.x1}, ${line.y1}`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  page={linePage}
                  pageCount={linePageCount}
                  onPageChange={setLinePage}
                />
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
