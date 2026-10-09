import type { EbookStore } from './ebook-store'
import { EbookStoreError } from './errors'
import { getErrorCode } from './storage/errors'
import { storeOperations } from './storage/operations'

export class EbookStoreClient implements EbookStore {
  private pending: Promise<void> | undefined

  initialize(): ReturnType<EbookStore['initialize']> {
    return this.enqueue('initialize', () => storeOperations.initialize())
  }

  clearStorage(): ReturnType<EbookStore['clearStorage']> {
    return this.enqueue('clearStorage', () => storeOperations.clearStorage())
  }

  saveBook(input: Parameters<EbookStore['saveBook']>[0]): ReturnType<EbookStore['saveBook']> {
    return this.enqueue('saveBook', () => storeOperations.saveBook(input), 1)
  }

  getBook(id: Parameters<EbookStore['getBook']>[0]): ReturnType<EbookStore['getBook']> {
    return this.enqueue('getBook', () => storeOperations.getBook(id))
  }

  deleteBook(id: Parameters<EbookStore['deleteBook']>[0]): ReturnType<EbookStore['deleteBook']> {
    return this.enqueue('deleteBook', () => storeOperations.deleteBook(id))
  }

  listBooks(): ReturnType<EbookStore['listBooks']> {
    return this.enqueue('listBooks', () => storeOperations.listBooks())
  }

  hasBook(id: Parameters<EbookStore['hasBook']>[0]): ReturnType<EbookStore['hasBook']> {
    return this.enqueue('hasBook', () => storeOperations.hasBook(id))
  }

  updateProgress(
    input: Parameters<EbookStore['updateProgress']>[0],
  ): ReturnType<EbookStore['updateProgress']> {
    return this.enqueue('updateProgress', () => storeOperations.updateProgress(input))
  }

  updateTitle(
    input: Parameters<EbookStore['updateTitle']>[0],
  ): ReturnType<EbookStore['updateTitle']> {
    return this.enqueue('updateTitle', () => storeOperations.updateTitle(input))
  }

  updateCover(
    input: Parameters<EbookStore['updateCover']>[0],
  ): ReturnType<EbookStore['updateCover']> {
    return this.enqueue('updateCover', () => storeOperations.updateCover(input))
  }

  initializeOcrPages(
    input: Parameters<EbookStore['initializeOcrPages']>[0],
  ): ReturnType<EbookStore['initializeOcrPages']> {
    return this.enqueue('initializeOcrPages', () => storeOperations.initializeOcrPages(input))
  }

  prepareOcrPagesForRun(
    bookId: Parameters<EbookStore['prepareOcrPagesForRun']>[0],
  ): ReturnType<EbookStore['prepareOcrPagesForRun']> {
    return this.enqueue('prepareOcrPagesForRun', () =>
      storeOperations.prepareOcrPagesForRun(bookId),
    )
  }

  acquireNextOcrPage(
    bookId: Parameters<EbookStore['acquireNextOcrPage']>[0],
  ): ReturnType<EbookStore['acquireNextOcrPage']> {
    return this.enqueue('acquireNextOcrPage', () => storeOperations.acquireNextOcrPage(bookId))
  }

  storeOcrPage(
    input: Parameters<EbookStore['storeOcrPage']>[0],
  ): ReturnType<EbookStore['storeOcrPage']> {
    return this.enqueue('storeOcrPage', () => storeOperations.storeOcrPage(input))
  }

  failOcrPage(
    pageId: Parameters<EbookStore['failOcrPage']>[0],
  ): ReturnType<EbookStore['failOcrPage']> {
    return this.enqueue('failOcrPage', () => storeOperations.failOcrPage(pageId))
  }

  failBookAnalysis(
    bookId: Parameters<EbookStore['failBookAnalysis']>[0],
  ): ReturnType<EbookStore['failBookAnalysis']> {
    return this.enqueue('failBookAnalysis', () => storeOperations.failBookAnalysis(bookId))
  }

  getBookAnalysisStatus(
    bookId: Parameters<EbookStore['getBookAnalysisStatus']>[0],
  ): ReturnType<EbookStore['getBookAnalysisStatus']> {
    return this.enqueue('getBookAnalysisStatus', () =>
      storeOperations.getBookAnalysisStatus(bookId),
    )
  }

  retryBookAnalysis(
    bookId: Parameters<EbookStore['retryBookAnalysis']>[0],
  ): ReturnType<EbookStore['retryBookAnalysis']> {
    return this.enqueue('retryBookAnalysis', () => storeOperations.retryBookAnalysis(bookId))
  }

  getStoredOcrPage(
    input: Parameters<EbookStore['getStoredOcrPage']>[0],
  ): ReturnType<EbookStore['getStoredOcrPage']> {
    return this.enqueue('getStoredOcrPage', () => storeOperations.getStoredOcrPage(input))
  }

  listOcrPages(
    bookId: Parameters<EbookStore['listOcrPages']>[0],
  ): ReturnType<EbookStore['listOcrPages']> {
    return this.enqueue('listOcrPages', () => storeOperations.listOcrPages(bookId))
  }

  listOcrLines(
    input: Parameters<EbookStore['listOcrLines']>[0],
  ): ReturnType<EbookStore['listOcrLines']> {
    return this.enqueue('listOcrLines', () => storeOperations.listOcrLines(input))
  }

  getOcrLinesForChunking(
    bookId: Parameters<EbookStore['getOcrLinesForChunking']>[0],
  ): ReturnType<EbookStore['getOcrLinesForChunking']> {
    return this.enqueue('getOcrLinesForChunking', () =>
      storeOperations.getOcrLinesForChunking(bookId),
    )
  }

  storeSearchIndex(
    input: Parameters<EbookStore['storeSearchIndex']>[0],
  ): ReturnType<EbookStore['storeSearchIndex']> {
    return this.enqueue('storeSearchIndex', () => storeOperations.storeSearchIndex(input))
  }

  listSearchChunks(
    input: Parameters<EbookStore['listSearchChunks']>[0],
  ): ReturnType<EbookStore['listSearchChunks']> {
    return this.enqueue('listSearchChunks', () => storeOperations.listSearchChunks(input))
  }

  searchChunks(
    query: Parameters<EbookStore['searchChunks']>[0],
  ): ReturnType<EbookStore['searchChunks']> {
    return this.enqueue('searchChunks', () => storeOperations.searchChunks(query))
  }

  listSearchTerms(
    input: Parameters<EbookStore['listSearchTerms']>[0],
  ): ReturnType<EbookStore['listSearchTerms']> {
    return this.enqueue('listSearchTerms', () => storeOperations.listSearchTerms(input))
  }

  listSearchPostings(
    input: Parameters<EbookStore['listSearchPostings']>[0],
  ): ReturnType<EbookStore['listSearchPostings']> {
    return this.enqueue('listSearchPostings', () => storeOperations.listSearchPostings(input))
  }

  listChunkSources(
    input: Parameters<EbookStore['listChunkSources']>[0],
  ): ReturnType<EbookStore['listChunkSources']> {
    return this.enqueue('listChunkSources', () => storeOperations.listChunkSources(input))
  }

  private enqueue<Result>(
    name: keyof EbookStore,
    task: () => Promise<Result>,
    attempts = 3,
  ): Promise<Result> {
    const operation = this.executeAfter(this.pending, name, task, attempts)
    // 대기열에는 완료 여부만 남겨 큰 PDF 조회 결과를 계속 참조하지 않는다.
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  private async executeAfter<Result>(
    previous: Promise<void> | undefined,
    name: keyof EbookStore,
    task: () => Promise<Result>,
    attempts: number,
  ): Promise<Result> {
    // DB와 PDF를 함께 다루는 작업 및 전체 삭제가 서로 끼어들지 않게 한다.
    // 앞선 요청의 오류는 해당 호출자가 처리하고 다음 요청은 계속 실행한다.
    await previous
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await task()
      } catch (error) {
        const code = getErrorCode(error)
        if (code === 'locked' && attempt < attempts) continue
        if (code === 'storage-failed') console.error('Storage operation failed', { name, error })
        throw new EbookStoreError(code, error)
      }
    }
  }
}
