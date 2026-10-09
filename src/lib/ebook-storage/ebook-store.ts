import type { AddBookInput, StoredBook, StoredBookDetail, BookAnalysisStatus } from './data/book'
import type {
  NextOcrPage,
  StoredOcrPage,
  OcrPageRecord,
  OcrLinePage,
  OcrLineForChunking,
} from './data/ocr'
import type {
  SearchChunkPage,
  SearchTermPage,
  SearchPostingPage,
  ChunkSourcePage,
} from './data/search-index'
import type { SearchChunkQuery, SearchChunkResult } from './data/search'
import type {
  UpdateCoverInput,
  UpdateProgressInput,
  UpdateTitleInput,
  InitializeOcrPagesInput,
  StoreOcrPageInput,
  StoreSearchIndexInput,
  ListOcrLinesInput,
  GetStoredOcrPageInput,
} from './data/inputs'

export interface EbookStore {
  initialize(): Promise<void>
  clearStorage(): Promise<void>
  saveBook(input: AddBookInput): Promise<string>
  getBook(id: string): Promise<StoredBookDetail>
  deleteBook(id: string): Promise<void>
  listBooks(): Promise<StoredBook[]>
  hasBook(id: string): Promise<void>
  updateProgress(input: UpdateProgressInput): Promise<void>
  updateTitle(input: UpdateTitleInput): Promise<void>
  updateCover(input: UpdateCoverInput): Promise<void>
  initializeOcrPages(input: InitializeOcrPagesInput): Promise<void>
  prepareOcrPagesForRun(bookId: string): Promise<void>
  acquireNextOcrPage(bookId: string): Promise<NextOcrPage | null>
  storeOcrPage(input: StoreOcrPageInput): Promise<boolean>
  failOcrPage(pageId: string): Promise<void>
  failBookAnalysis(bookId: string): Promise<void>
  getBookAnalysisStatus(bookId: string): Promise<BookAnalysisStatus>
  retryBookAnalysis(bookId: string): Promise<void>
  getStoredOcrPage(input: GetStoredOcrPageInput): Promise<StoredOcrPage | null>
  listOcrPages(bookId: string): Promise<OcrPageRecord[]>
  listOcrLines(input: ListOcrLinesInput): Promise<OcrLinePage>
  getOcrLinesForChunking(bookId: string): Promise<OcrLineForChunking[]>
  storeSearchIndex(input: StoreSearchIndexInput): Promise<void>
  listSearchChunks(input: ListOcrLinesInput): Promise<SearchChunkPage>
  searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]>
  listSearchTerms(input: ListOcrLinesInput): Promise<SearchTermPage>
  listSearchPostings(input: ListOcrLinesInput): Promise<SearchPostingPage>
  listChunkSources(input: ListOcrLinesInput): Promise<ChunkSourcePage>
}
