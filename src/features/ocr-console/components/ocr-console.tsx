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
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { OcrLinePage, OcrPageRecord } from '@/lib/ebook-storage/types/ocr'
import type {
  ChunkSourcePage,
  SearchChunkPage,
  SearchPostingPage,
  SearchTermPage,
} from '@/lib/ebook-storage/types/search-index'
import { useEffect, useState } from 'react'
import type { OcrConsoleStore } from '../lib/ocr-console-store'

const BOOKS_PER_PAGE = 10
const LINES_PER_PAGE = 50

interface ConsoleBook {
  id: string
  title: string
  analysisStatus: 'analyzing' | 'ready' | 'failed'
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

export function OcrConsole({ store }: { store: OcrConsoleStore }) {
  const [books, setBooks] = useState<ConsoleBook[]>([])
  const [bookPage, setBookPage] = useState(0)
  const [selectedBook, setSelectedBook] = useState<ConsoleBook | null>(null)
  const [linePage, setLinePage] = useState(0)
  const [chunkPage, setChunkPage] = useState(0)
  const [sourcePage, setSourcePage] = useState(0)
  const [termPage, setTermPage] = useState(0)
  const [postingPage, setPostingPage] = useState(0)
  const [ocrPage, setOcrPage] = useState<OcrLinePage | null>(null)
  const [ocrPages, setOcrPages] = useState<OcrPageRecord[]>([])
  const [searchChunks, setSearchChunks] = useState<SearchChunkPage | null>(null)
  const [chunkSources, setChunkSources] = useState<ChunkSourcePage | null>(null)
  const [searchTerms, setSearchTerms] = useState<SearchTermPage | null>(null)
  const [searchPostings, setSearchPostings] = useState<SearchPostingPage | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadBooks() {
      try {
        const result = await store.listBooks()
        setBooks(
          result.map((book) => ({
            id: book.id,
            title: book.title,
            analysisStatus: book.analysis_status,
          })),
        )
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
        const [
          lineResult,
          pageResult,
          chunkResult,
          sourceResult,
          termResult,
          postingResult,
          analysisStatus,
        ] = await Promise.all([
          store.listOcrLines({
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: linePage * LINES_PER_PAGE,
          }),
          store.listOcrPages(book.id),
          store.listSearchChunks({
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: chunkPage * LINES_PER_PAGE,
          }),
          store.listChunkSources({
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: sourcePage * LINES_PER_PAGE,
          }),
          store.listSearchTerms({
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: termPage * LINES_PER_PAGE,
          }),
          store.listSearchPostings({
            bookId: book.id,
            limit: LINES_PER_PAGE,
            offset: postingPage * LINES_PER_PAGE,
          }),
          store.getBookAnalysisStatus(book.id),
        ])
        if (cancelled) return
        setOcrPage(lineResult)
        setOcrPages(pageResult)
        setSearchChunks(chunkResult)
        setChunkSources(sourceResult)

        const maxTermPage = Math.max(0, Math.ceil(termResult.total / LINES_PER_PAGE) - 1)
        const maxPostingPage = Math.max(0, Math.ceil(postingResult.total / LINES_PER_PAGE) - 1)

        setSearchTerms(termResult)
        setSearchPostings(postingResult)

        setTermPage((current) => Math.min(current, maxTermPage))
        setPostingPage((current) => Math.min(current, maxPostingPage))

        setSelectedBook((current) =>
          current?.id === book.id && current.analysisStatus !== analysisStatus
            ? { ...current, analysisStatus }
            : current,
        )
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
  }, [chunkPage, linePage, postingPage, refreshTick, selectedBook, sourcePage, store, termPage])

  useEffect(() => {
    if (!selectedBook || selectedBook.analysisStatus !== 'analyzing') return
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
  const termPageCount = searchTerms ? Math.ceil(searchTerms.total / LINES_PER_PAGE) : 0
  const postingPageCount = searchPostings ? Math.ceil(searchPostings.total / LINES_PER_PAGE) : 0
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
                setTermPage(0)
                setPostingPage(0)
                setOcrPage(null)
                setOcrPages([])
                setSearchChunks(null)
                setChunkSources(null)
                setSearchTerms(null)
                setSearchPostings(null)
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
                <TabsTrigger value="search-terms">search_terms</TabsTrigger>
                <TabsTrigger value="search-postings">search_postings</TabsTrigger>
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
              <TabsContent className="flex flex-col gap-3" value="search-terms">
                <p className="text-muted-foreground">
                  이 책의 search_terms, {searchTerms?.total ?? 0}개
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>id</TableHead>
                      <TableHead>term</TableHead>
                      <TableHead>document_frequency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchTerms?.terms.map((term) => (
                      <TableRow key={term.id}>
                        <TableCell>{term.id}</TableCell>
                        <TableCell>{term.term}</TableCell>
                        <TableCell>{term.document_frequency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  page={termPage}
                  pageCount={termPageCount}
                  onPageChange={setTermPage}
                />
              </TabsContent>
              <TabsContent className="flex flex-col gap-3" value="search-postings">
                <p className="text-muted-foreground">
                  이 책의 search_postings, {searchPostings?.total ?? 0}개
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>term_id</TableHead>
                      <TableHead>term</TableHead>
                      <TableHead>chunk ordinal</TableHead>
                      <TableHead>term_frequency</TableHead>
                      <TableHead>chunk_id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchPostings?.postings.map((posting) => (
                      <TableRow key={`${posting.term_id}-${posting.chunk_id}`}>
                        <TableCell>{posting.term_id}</TableCell>
                        <TableCell>{posting.term}</TableCell>
                        <TableCell>{posting.chunk_ordinal}</TableCell>
                        <TableCell>{posting.term_frequency}</TableCell>
                        <TableCell className="font-mono text-xs">{posting.chunk_id}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  page={postingPage}
                  pageCount={postingPageCount}
                  onPageChange={setPostingPage}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
