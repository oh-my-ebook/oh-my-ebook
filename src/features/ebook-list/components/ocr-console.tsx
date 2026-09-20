import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import type {
  ChunkSourcePage,
  ChunkSourceRecord,
  OcrLinePage,
  OcrLineRecord,
  OcrPageRecord,
  SearchChunkPage,
  SearchChunkRecord,
} from '../ebook-types'
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

function isSearchChunkRecord(value: unknown): value is SearchChunkRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'string') return false
  if (!('ordinal' in value) || typeof value.ordinal !== 'number') return false
  if (!('text' in value) || typeof value.text !== 'string') return false
  if (!('token_count' in value) || typeof value.token_count !== 'number') return false
  if (!('created_at' in value) || typeof value.created_at !== 'number') return false
  return true
}

function isSearchChunkPage(value: unknown): value is SearchChunkPage {
  if (typeof value !== 'object' || value === null) return false
  if (!('total' in value) || typeof value.total !== 'number') return false
  if (!('chunks' in value) || !Array.isArray(value.chunks)) return false
  return value.chunks.every(isSearchChunkRecord)
}

function isChunkSourceRecord(value: unknown): value is ChunkSourceRecord {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value) || typeof value.id !== 'number') return false
  if (!('chunk_id' in value) || typeof value.chunk_id !== 'string') return false
  if (!('chunk_ordinal' in value) || typeof value.chunk_ordinal !== 'number') return false
  if (!('ocr_page_id' in value) || typeof value.ocr_page_id !== 'string') return false
  if (!('page_number' in value) || typeof value.page_number !== 'number') return false
  if (!('start_line_index' in value) || typeof value.start_line_index !== 'number') return false
  if (!('end_line_index' in value) || typeof value.end_line_index !== 'number') return false
  if (!('source_order' in value) || typeof value.source_order !== 'number') return false
  return true
}

function isChunkSourcePage(value: unknown): value is ChunkSourcePage {
  if (typeof value !== 'object' || value === null) return false
  if (!('total' in value) || typeof value.total !== 'number') return false
  if (!('sources' in value) || !Array.isArray(value.sources)) return false
  return value.sources.every(isChunkSourceRecord)
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
  const [chunkPage, setChunkPage] = useState(0)
  const [sourcePage, setSourcePage] = useState(0)
  const [ocrPage, setOcrPage] = useState<OcrLinePage | null>(null)
  const [ocrPages, setOcrPages] = useState<OcrPageRecord[]>([])
  const [searchChunks, setSearchChunks] = useState<SearchChunkPage | null>(null)
  const [chunkSources, setChunkSources] = useState<ChunkSourcePage | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
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
    let cancelled = false

    async function loadOcrData() {
      try {
        const [lineResult, pageResult, chunkResult, sourceResult] = await Promise.all([
          store.request('listOcrLines', {
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: linePage * LINES_PER_PAGE,
          }),
          store.request('listOcrPages', book.id),
          store.request('listSearchChunks', {
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: chunkPage * LINES_PER_PAGE,
          }),
          store.request('listChunkSources', {
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: sourcePage * LINES_PER_PAGE,
          }),
        ])
        if (!isOcrLinePage(lineResult)) throw new Error('Invalid OCR lines')
        if (!Array.isArray(pageResult) || !pageResult.every(isOcrPageRecord)) {
          throw new Error('Invalid OCR pages')
        }
        if (!isSearchChunkPage(chunkResult)) throw new Error('Invalid search chunks')
        if (!isChunkSourcePage(sourceResult)) throw new Error('Invalid chunk sources')
        if (cancelled) return
        setOcrPage(lineResult)
        setOcrPages(pageResult)
        setSearchChunks(chunkResult)
        setChunkSources(sourceResult)
        setError(null)
      } catch {
        if (cancelled) return
        setError('OCR 저장 내용을 불러오지 못했습니다.')
      }
    }

    void loadOcrData()
    return () => {
      cancelled = true
    }
  }, [chunkPage, linePage, refreshTick, selectedBook, sourcePage, store])

  useEffect(() => {
    if (!selectedBook) return
    const intervalId = window.setInterval(() => {
      setRefreshTick((current) => current + 1)
    }, 1500)
    return () => window.clearInterval(intervalId)
  }, [selectedBook])

  const visibleBooks = books.slice(bookPage * BOOKS_PER_PAGE, (bookPage + 1) * BOOKS_PER_PAGE)
  const bookPageCount = Math.ceil(books.length / BOOKS_PER_PAGE)
  const linePageCount = ocrPage ? Math.ceil(ocrPage.total / LINES_PER_PAGE) : 0
  const chunkPageCount = searchChunks ? Math.ceil(searchChunks.total / LINES_PER_PAGE) : 0
  const sourcePageCount = chunkSources ? Math.ceil(chunkSources.total / LINES_PER_PAGE) : 0
  const completedOcrPages = ocrPages.filter((page) => page.status === 'ready').length
  const processingOcrPages = ocrPages.filter((page) => page.status === 'processing')
  const ocrProgress = ocrPages.length ? (completedOcrPages / ocrPages.length) * 100 : null
  const ocrWorkerStatus = processingOcrPages.length
    ? `OCR Worker가 ${processingOcrPages.map((page) => `${page.page_number}페이지`).join(', ')} 처리 중`
    : 'OCR Worker가 처리 중인 페이지 없음'

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
                setChunkPage(0)
                setSourcePage(0)
                setOcrPage(null)
                setOcrPages([])
                setSearchChunks(null)
                setChunkSources(null)
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
            <CardDescription>책에 연결된 SQLite 테이블을 확인합니다.</CardDescription>
            <CardAction>
              <Button
                onClick={() => setRefreshTick((current) => current + 1)}
                size="sm"
                variant="outline"
              >
                새로고침
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Progress value={ocrProgress ?? 0}>
              <ProgressLabel>{ocrWorkerStatus}</ProgressLabel>
              <ProgressValue>{() => `${completedOcrPages} / ${ocrPages.length}`}</ProgressValue>
            </Progress>
            <Tabs defaultValue="ocr-pages">
              <TabsList className="max-w-full overflow-x-auto">
                <TabsTrigger value="ocr-pages">ocr_pages</TabsTrigger>
                <TabsTrigger value="ocr-lines">ocr_lines</TabsTrigger>
                <TabsTrigger value="search-chunks">search_chunks</TabsTrigger>
                <TabsTrigger value="chunk-sources">chunk_sources</TabsTrigger>
              </TabsList>
              <TabsContent className="flex flex-col gap-3" value="ocr-pages">
                <p className="text-muted-foreground">페이지별 OCR 처리 상태와 렌더 크기</p>
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
              </TabsContent>
              <TabsContent className="flex flex-col gap-3" value="ocr-lines">
                <p className="text-muted-foreground">
                  저장된 OCR 원문과 좌표, {ocrPage?.total ?? 0}개
                </p>
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
              </TabsContent>
              <TabsContent className="flex flex-col gap-3" value="search-chunks">
                <p className="text-muted-foreground">
                  Kiwi 처리 뒤 저장된 검색 청크, {searchChunks?.total ?? 0}개
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ordinal</TableHead>
                      <TableHead>token_count</TableHead>
                      <TableHead>id</TableHead>
                      <TableHead>text</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchChunks?.chunks.map((chunk) => (
                      <TableRow key={chunk.id}>
                        <TableCell>{chunk.ordinal}</TableCell>
                        <TableCell>{chunk.token_count}</TableCell>
                        <TableCell className="font-mono text-xs">{chunk.id}</TableCell>
                        <TableCell className="whitespace-normal">{chunk.text}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  page={chunkPage}
                  pageCount={chunkPageCount}
                  onPageChange={setChunkPage}
                />
              </TabsContent>
              <TabsContent className="flex flex-col gap-3" value="chunk-sources">
                <p className="text-muted-foreground">
                  청크를 PDF 페이지와 OCR 줄로 되돌리는 연결, {chunkSources?.total ?? 0}개
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>chunk ordinal</TableHead>
                      <TableHead>source order</TableHead>
                      <TableHead>페이지</TableHead>
                      <TableHead>줄 범위</TableHead>
                      <TableHead>chunk id</TableHead>
                      <TableHead>ocr page id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chunkSources?.sources.map((source) => (
                      <TableRow key={source.id}>
                        <TableCell>{source.chunk_ordinal}</TableCell>
                        <TableCell>{source.source_order}</TableCell>
                        <TableCell>{source.page_number}</TableCell>
                        <TableCell>{`${source.start_line_index}–${source.end_line_index}`}</TableCell>
                        <TableCell className="font-mono text-xs">{source.chunk_id}</TableCell>
                        <TableCell className="font-mono text-xs">{source.ocr_page_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  page={sourcePage}
                  pageCount={sourcePageCount}
                  onPageChange={setSourcePage}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
