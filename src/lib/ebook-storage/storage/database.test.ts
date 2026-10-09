import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm'
import { createBookInput, createTestDatabase } from '../../../test/sqlocal'
import { DeletedBookError, DuplicateBookError, getErrorCode, NotFoundBookError } from './errors'
import {
  addBook,
  deleteBookById,
  executeSqliteCommand,
  getBookMetadata,
  listBooks,
} from './database'

async function setup() {
  const db = await createTestDatabase()
  const id = await addBook(db, createBookInput())
  const execute = (command: string, payload: unknown = id) =>
    executeSqliteCommand(db, { command, payload })
  return { db, id, execute }
}

async function preparePages() {
  const context = await setup()
  await context.execute('initializeOcrPages', { bookId: context.id, pageCount: 2 })
  const pages = await context.db.sql<{ id: string }>(
    'SELECT id FROM ocr_pages ORDER BY page_number',
  )
  return { ...context, pages }
}

function chunk(id: string, pageId: string) {
  return {
    id,
    ordinal: 0,
    text: '전자책 검색',
    tokenCount: 2,
    sources: [{ ocrPageId: pageId, startLineIndex: 0, endLineIndex: 0, sourceOrder: 0 }],
    terms: [{ term: '검색', termFrequency: 1 }],
  }
}

describe('SQLocal 저장소', () => {
  it('빈 목록, 매개변수, BLOB, NULL과 등록 시각·id 내림차순을 유지한다', async () => {
    const db = await createTestDatabase()
    expect(await listBooks(db)).toEqual([])
    const title = "따옴표 ' 와 ? 제목"
    const id = await addBook(
      db,
      createBookInput({ title, coverData: new Uint8Array([0, 128, 255]).buffer }),
    )
    await addBook(db, createBookInput({ contentHash: 'b'.repeat(64), title: '두 번째 책' }))
    await db.sql('UPDATE books SET created_at = 100')
    const expected = await db.sql('SELECT * FROM books ORDER BY created_at DESC, id DESC')
    expect(await listBooks(db)).toEqual(expected)
    expect(expected.find((book) => book.id === id)).toMatchObject({
      title,
      author: null,
      last_page: null,
      cover_data: new Uint8Array([0, 128, 255]),
    })
    await expect(addBook(db, createBookInput())).rejects.toBeInstanceOf(DuplicateBookError)
  })

  it('제목·표지·읽기 위치를 갱신하고 범위 밖 위치와 삭제된 책을 거부한다', async () => {
    const { db, id, execute } = await setup()
    await execute('updateTitle', { id, title: ' 새 제목 ' })
    await execute('updateCover', {
      id,
      coverData: new Uint8Array([4, 5]).buffer,
      coverMime: 'image/png',
    })
    await execute('updateProgress', { id, page: 2 })
    expect(await getBookMetadata(db, id)).toMatchObject({ title: '새 제목', last_page: 2 })
    expect(await listBooks(db)).toEqual([
      expect.objectContaining({ cover_data: new Uint8Array([4, 5]), cover_status: 'ready' }),
    ])
    await expect(execute('updateProgress', { id, page: 3 })).rejects.toBeInstanceOf(
      DeletedBookError,
    )
    expect(await getBookMetadata(db, id)).toMatchObject({ last_page: 2 })
    await db.sql('PRAGMA ignore_check_constraints = ON')
    await db.sql('UPDATE books SET last_page = 10 WHERE id = ?', id)
    expect(await getBookMetadata(db, id)).toMatchObject({ last_page: 1 })
    await deleteBookById(db, id)
    await expect(execute('hasBook')).rejects.toBeInstanceOf(DeletedBookError)
    await expect(getBookMetadata(db, id)).rejects.toBeInstanceOf(NotFoundBookError)
    await expect(execute('getBookAnalysisStatus')).rejects.toThrow()
  })

  it('삭제된 책의 수정·재삭제를 거부하고 다른 책은 유지한다', async () => {
    const { db, id, execute } = await setup()
    const before = await listBooks(db)
    await expect(execute('updateTitle', { id: 'missing', title: '변경' })).rejects.toBeInstanceOf(
      DeletedBookError,
    )
    await expect(
      execute('updateCover', {
        id: 'missing',
        coverData: new Uint8Array([1]).buffer,
        coverMime: 'image/png',
      }),
    ).rejects.toBeInstanceOf(DeletedBookError)
    await expect(execute('updateProgress', { id: 'missing', page: 1 })).rejects.toBeInstanceOf(
      DeletedBookError,
    )
    await expect(deleteBookById(db, 'missing')).rejects.toBeInstanceOf(DeletedBookError)
    expect(await listBooks(db)).toEqual(before)
    expect(await getBookMetadata(db, id)).toMatchObject({ id })
  })

  it('동일 PDF의 동시 저장은 하나만 성공하고 실패한 트랜잭션 뒤에도 저장할 수 있다', async () => {
    const db = await createTestDatabase()
    const results = await Promise.allSettled([
      addBook(db, createBookInput()),
      addBook(db, createBookInput()),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failures = results.filter((result) => result.status === 'rejected')
    expect(failures.map((result) => getErrorCode(result.reason))).toEqual(['duplicate'])
    await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    expect(await listBooks(db)).toHaveLength(2)
  })

  it('OCR 페이지 초기화는 중복되지 않고 동시 선점은 서로 다른 페이지를 반환한다', async () => {
    const { db, id, execute } = await preparePages()
    await execute('initializeOcrPages', { bookId: id, pageCount: 2 })
    const claimed = await Promise.all([
      execute('acquireNextOcrPage'),
      execute('acquireNextOcrPage'),
    ])
    expect(claimed).toEqual([
      expect.objectContaining({ pageNumber: 1 }),
      expect.objectContaining({ pageNumber: 2 }),
    ])
    expect(await execute('acquireNextOcrPage')).toBeNull()
    expect(await db.sql('SELECT status FROM ocr_pages')).toEqual([
      { status: 'processing' },
      { status: 'processing' },
    ])
  })

  it('100개 OCR 페이지를 빠짐없이 등록하고 다시 초기화해도 기존 행을 유지한다', async () => {
    const db = await createTestDatabase()
    const id = await addBook(db, createBookInput({ pageCount: 100 }))
    const batchSpy = vi.spyOn(db, 'batch')
    onTestFinished(() => batchSpy.mockRestore())
    const request = { command: 'initializeOcrPages', payload: { bookId: id, pageCount: 100 } }
    await executeSqliteCommand(db, request)
    const pages = await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')
    expect(pages.map((page) => page.page_number)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    )
    await executeSqliteCommand(db, request)
    expect(await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')).toEqual(pages)
    expect(batchSpy).toHaveBeenCalledTimes(2)
  })

  it('OCR 페이지 등록 도중 실패하면 앞서 등록한 페이지도 롤백하고 재시도할 수 있다', async () => {
    const { db, id, execute } = await setup()
    await db.sql(`CREATE TRIGGER fail_second_page BEFORE INSERT ON ocr_pages
      WHEN NEW.page_number = 2 BEGIN SELECT RAISE(ABORT, 'page failure'); END`)
    await expect(execute('initializeOcrPages', { bookId: id, pageCount: 2 })).rejects.toThrow(
      'page failure',
    )
    expect(await db.sql('SELECT * FROM ocr_pages')).toEqual([])
    await db.sql('DROP TRIGGER fail_second_page')
    await execute('initializeOcrPages', { bookId: id, pageCount: 2 })
    expect(await db.sql('SELECT page_number FROM ocr_pages ORDER BY page_number')).toEqual([
      { page_number: 1 },
      { page_number: 2 },
    ])
  })

  it('실패한 OCR과 책 분석을 재시도 상태로 되돌린다', async () => {
    const { db, execute, pages } = await preparePages()
    await execute('acquireNextOcrPage')
    await execute('failOcrPage', pages[0].id)
    await execute('acquireNextOcrPage')
    await execute('failBookAnalysis')
    expect(await execute('getBookAnalysisStatus')).toBe('failed')
    await execute('prepareOcrPagesForRun')
    await execute('retryBookAnalysis')
    expect(await execute('getBookAnalysisStatus')).toBe('analyzing')
    expect(await db.sql('SELECT status FROM ocr_pages')).toEqual([
      { status: 'pending' },
      { status: 'pending' },
    ])
  })

  it('페이지 원문·좌표와 순서를 보존하고 마지막 페이지에서 OCR 완료를 기록한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    await execute('acquireNextOcrPage')
    await execute('acquireNextOcrPage')
    const lines = [
      { rawText: '첫 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
      { rawText: "둘째 줄 ' ?", x0: 5, y0: 6, x1: 7, y1: 8 },
    ]
    expect(
      await execute('storeOcrPage', { pageId: pages[0].id, width: 100, height: 200, lines }),
    ).toBe(false)
    expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 1 })).toEqual({
      width: 100,
      height: 200,
      lines,
    })
    expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 2 })).toBeNull()
    expect(
      await execute('storeOcrPage', { pageId: pages[1].id, width: 100, height: 200, lines: [] }),
    ).toBe(true)
    expect(await execute('listOcrPages')).toEqual(
      [1, 2].map((page_number) => ({ page_number, width: 100, height: 200, status: 'ready' })),
    )
    expect(await execute('listOcrLines', { bookId: id, limit: 10, offset: 0 })).toEqual({
      total: 2,
      lines: [
        { page_number: 1, line_index: 0, raw_text: '첫 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
        { page_number: 1, line_index: 1, raw_text: "둘째 줄 ' ?", x0: 5, y0: 6, x1: 7, y1: 8 },
      ],
    })
    expect(await execute('getOcrLinesForChunking')).toEqual([
      { ocr_page_id: pages[0].id, page_number: 1, line_index: 0, raw_text: '첫 줄' },
      { ocr_page_id: pages[0].id, page_number: 1, line_index: 1, raw_text: "둘째 줄 ' ?" },
    ])
    expect(await db.sql('SELECT ocr_completed_at FROM books')).toEqual([
      { ocr_completed_at: expect.any(Number) },
    ])
  })

  it.each(['pending', 'ready', 'failed'])(
    '%s 페이지는 OCR 저장·실패 처리를 거부하고 기존 데이터를 유지한다',
    async (status) => {
      const { db, execute, pages } = await preparePages()
      await db.sql('UPDATE ocr_pages SET status = ? WHERE id = ?', status, pages[0].id)
      await db.sql(
        `INSERT INTO ocr_lines (ocr_page_id, line_index, raw_text, x0, y0, x1, y1)
        VALUES (?, 0, '기존 줄', 0, 0, 1, 1)`,
        pages[0].id,
      )
      const before = await db.sql('SELECT * FROM ocr_lines')
      const pagesBefore = await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')
      await expect(
        execute('storeOcrPage', {
          pageId: pages[0].id,
          width: 100,
          height: 200,
          lines: [],
        }),
      ).rejects.toThrow('Unable to store OCR page')
      await expect(execute('failOcrPage', pages[0].id)).rejects.toBeInstanceOf(NotFoundBookError)
      expect(await db.sql('SELECT * FROM ocr_lines')).toEqual(before)
      expect(await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')).toEqual(pagesBefore)
    },
  )

  it('OCR 재개는 완료 페이지와 다른 책을 유지하고 최초 완료 시각을 덮어쓰지 않는다', async () => {
    const { db, id, execute, pages } = await preparePages()
    const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    await execute('initializeOcrPages', { bookId: otherId, pageCount: 1 })
    await execute('acquireNextOcrPage', otherId)
    await db.sql("UPDATE ocr_pages SET status = 'ready' WHERE id = ?", pages[0].id)
    await db.sql("UPDATE ocr_pages SET status = 'failed' WHERE id = ?", pages[1].id)
    await db.sql('UPDATE books SET ocr_completed_at = 123 WHERE id = ?', id)
    await execute('prepareOcrPagesForRun')
    expect(await execute('listOcrPages')).toEqual([
      { page_number: 1, status: 'ready', width: null, height: null },
      { page_number: 2, status: 'pending', width: null, height: null },
    ])
    expect(await execute('listOcrPages', otherId)).toEqual([
      { page_number: 1, status: 'processing', width: null, height: null },
    ])
    await execute('acquireNextOcrPage')
    expect(
      await execute('storeOcrPage', {
        pageId: pages[1].id,
        width: 100,
        height: 200,
        lines: [],
      }),
    ).toBe(true)
    expect(await db.sql('SELECT ocr_completed_at FROM books WHERE id = ?', id)).toEqual([
      { ocr_completed_at: 123 },
    ])
  })

  it('실패하지 않은 책의 재시도와 없는 책·페이지의 상태 변경을 거부한다', async () => {
    const { db, id, execute } = await setup()
    for (const status of ['analyzing', 'ready']) {
      await db.sql('UPDATE books SET analysis_status = ? WHERE id = ?', status, id)
      await expect(execute('retryBookAnalysis')).rejects.toBeInstanceOf(NotFoundBookError)
      expect(await execute('getBookAnalysisStatus')).toBe(status)
    }
    for (const command of ['retryBookAnalysis', 'failBookAnalysis', 'failOcrPage']) {
      await expect(execute(command, 'missing')).rejects.toBeInstanceOf(NotFoundBookError)
    }
    await expect(
      execute('initializeOcrPages', { bookId: 'missing', pageCount: 1 }),
    ).rejects.toBeInstanceOf(NotFoundBookError)
    await expect(
      execute('storeOcrPage', {
        pageId: 'missing',
        width: 100,
        height: 200,
        lines: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundBookError)
  })

  it.each([1, 1000])(
    '%i개 OCR 줄을 한 번의 batch로 저장하고 빈 결과로 교체한다',
    async (lineCount) => {
      const { db, id, execute, pages } = await preparePages()
      await execute('acquireNextOcrPage')
      const transaction = db.transaction
      const batches: number[] = []
      const transactionSpy = vi.spyOn(db, 'transaction').mockImplementation(async (callback) =>
        transaction(async (tx) => {
          const batchSpy = vi.spyOn(tx, 'batch')
          try {
            return await callback(tx)
          } finally {
            batches.push(batchSpy.mock.calls.length)
            batchSpy.mockRestore()
          }
        }),
      )
      onTestFinished(() => transactionSpy.mockRestore())
      const lines = Array.from({ length: lineCount }, (_, index) => ({
        rawText: `줄 ${index}`,
        x0: 0,
        y0: index,
        x1: 10,
        y1: index + 1,
      }))
      const input = { pageId: pages[0].id, width: 100, height: 2000, lines }
      await execute('storeOcrPage', input)
      expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 1 })).toEqual({
        width: 100,
        height: 2000,
        lines,
      })
      await db.sql("UPDATE ocr_pages SET status = 'processing' WHERE id = ?", pages[0].id)
      await execute('storeOcrPage', { ...input, lines: [] })
      expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 1 })).toEqual({
        width: 100,
        height: 2000,
        lines: [],
      })
      expect(batches).toEqual([1, 1])
    },
  )

  it('OCR 조회는 다른 책을 제외하고 페이지·줄 순서와 페이지네이션을 유지한다', async () => {
    const { db, id, execute } = await setup()
    const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    await db.sql(
      `INSERT INTO ocr_pages (id, book_id, page_number, width, height, status, created_at, updated_at)
       VALUES ('page-2', ?, 2, 100, 200, 'ready', 0, 0),
              ('other-page', ?, 1, 100, 200, 'ready', 0, 0),
              ('page-1', ?, 1, NULL, NULL, 'pending', 0, 0)`,
      id,
      otherId,
      id,
    )
    await db.sql(`INSERT INTO ocr_lines (ocr_page_id, line_index, raw_text, x0, y0, x1, y1)
      VALUES ('page-2', 1, '마지막 줄', 1, 2, 3, 4),
             ('other-page', 0, '다른 책', 1, 2, 3, 4),
             ('page-2', 0, '중간 줄', 1, 2, 3, 4),
             ('page-1', 0, '첫 줄', 1, 2, 3, 4)`)

    expect(await execute('listOcrPages')).toEqual([
      { page_number: 1, status: 'pending', width: null, height: null },
      { page_number: 2, status: 'ready', width: 100, height: 200 },
    ])
    expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 1 })).toBeNull()
    expect(await execute('getStoredOcrPage', { bookId: id, pageNumber: 2 })).toEqual({
      width: 100,
      height: 200,
      lines: [
        { rawText: '중간 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
        { rawText: '마지막 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
      ],
    })
    expect(await execute('listOcrLines', { bookId: id, limit: 2, offset: 1 })).toEqual({
      total: 3,
      lines: [
        { page_number: 2, line_index: 0, raw_text: '중간 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
        { page_number: 2, line_index: 1, raw_text: '마지막 줄', x0: 1, y0: 2, x1: 3, y1: 4 },
      ],
    })
    expect(await execute('listOcrLines', { bookId: id, limit: 2, offset: 3 })).toEqual({
      total: 3,
      lines: [],
    })
    expect(await execute('getOcrLinesForChunking')).toEqual([
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '첫 줄' },
      { ocr_page_id: 'page-2', page_number: 2, line_index: 0, raw_text: '중간 줄' },
      { ocr_page_id: 'page-2', page_number: 2, line_index: 1, raw_text: '마지막 줄' },
    ])
  })

  it('OCR 결과가 없으면 빈 목록과 null을 반환하고 없는 책의 분석 상태는 거부한다', async () => {
    const { id, execute } = await setup()
    for (const bookId of [id, 'missing']) {
      expect(await execute('listOcrPages', bookId)).toEqual([])
      expect(await execute('getOcrLinesForChunking', bookId)).toEqual([])
      expect(await execute('listOcrLines', { bookId, limit: 10, offset: 0 })).toEqual({
        total: 0,
        lines: [],
      })
      expect(await execute('getStoredOcrPage', { bookId, pageNumber: 1 })).toBeNull()
    }
    await expect(execute('getBookAnalysisStatus', 'missing')).rejects.toBeInstanceOf(
      NotFoundBookError,
    )
  })

  it('손상된 분석 상태·OCR 상태·이미지 크기를 조회할 때 기존 오류를 유지한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    await db.sql('PRAGMA ignore_check_constraints = ON')
    await db.sql("UPDATE books SET analysis_status = 'invalid' WHERE id = ?", id)
    await expect(execute('getBookAnalysisStatus')).rejects.toThrow('Invalid book analysis status')
    await db.sql("UPDATE ocr_pages SET status = 'invalid' WHERE id = ?", pages[0].id)
    await expect(execute('listOcrPages')).rejects.toThrow('Invalid OCR pages')
    await db.sql(
      "UPDATE ocr_pages SET status = 'ready', width = 0, height = 200 WHERE id = ?",
      pages[0].id,
    )
    await expect(execute('getStoredOcrPage', { bookId: id, pageNumber: 1 })).rejects.toThrow(
      'Invalid stored OCR page',
    )
  })

  it.each(['line', 'page', 'book'])(
    'OCR %s 저장 중 오류가 발생하면 기존 줄과 페이지 상태를 보존한다',
    async (target) => {
      const { db, execute, pages } = await preparePages()
      const input = {
        pageId: pages[0].id,
        width: 100,
        height: 200,
        lines: [{ rawText: '기존 줄', x0: 1, y0: 2, x1: 3, y1: 4 }],
      }
      await execute('acquireNextOcrPage')
      await execute('storeOcrPage', input)
      await db.sql("UPDATE ocr_pages SET status = 'processing' WHERE id = ?", pages[0].id)
      await db.sql("UPDATE ocr_pages SET status = 'ready' WHERE id = ?", pages[1].id)
      const before = await db.sql('SELECT * FROM ocr_lines')
      const pagesBefore = await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')
      const booksBefore = await db.sql('SELECT * FROM books')
      await db.sql(
        target === 'line'
          ? "CREATE TRIGGER fail_write BEFORE INSERT ON ocr_lines WHEN NEW.line_index = 1 BEGIN SELECT RAISE(ABORT, 'write failure'); END"
          : target === 'page'
            ? "CREATE TRIGGER fail_write BEFORE UPDATE ON ocr_pages BEGIN SELECT RAISE(ABORT, 'write failure'); END"
            : "CREATE TRIGGER fail_write BEFORE UPDATE ON books BEGIN SELECT RAISE(ABORT, 'write failure'); END",
      )
      await expect(
        execute('storeOcrPage', {
          ...input,
          lines: [
            { ...input.lines[0], rawText: '새 첫 줄' },
            { ...input.lines[0], rawText: '새 둘째 줄' },
          ],
        }),
      ).rejects.toMatchObject(
        target === 'line'
          ? { message: expect.stringContaining('write failure') }
          : {
              cause: expect.objectContaining({ message: expect.stringContaining('write failure') }),
            },
      )
      expect(await db.sql('SELECT * FROM ocr_lines')).toEqual(before)
      expect(await db.sql('SELECT * FROM ocr_pages ORDER BY page_number')).toEqual(pagesBefore)
      expect(await db.sql('SELECT * FROM books')).toEqual(booksBefore)
    },
  )

  it('검색 색인·출처·용어·빈도를 저장하고 BM25 순위와 페이지 출처를 반환한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    await execute('storeSearchIndex', {
      bookId: id,
      chunks: [
        chunk('chunk-1', pages[0].id),
        { ...chunk('chunk-2', pages[1].id), ordinal: 1, tokenCount: 5 },
      ],
    })
    expect(await execute('getBookAnalysisStatus')).toBe('ready')
    expect(await execute('searchChunks', { bookId: id, terms: ['검색'], limit: 5 })).toEqual([
      {
        id: 'chunk-1',
        ordinal: 0,
        text: '전자책 검색',
        tokenCount: 2,
        score: expect.any(Number),
        sources: [{ pageNumber: 1, startLineIndex: 0, endLineIndex: 0 }],
      },
      {
        id: 'chunk-2',
        ordinal: 1,
        text: '전자책 검색',
        tokenCount: 5,
        score: expect.any(Number),
        sources: [{ pageNumber: 2, startLineIndex: 0, endLineIndex: 0 }],
      },
    ])
    for (const terms of [[], ['없는검색어']])
      expect(await execute('searchChunks', { bookId: id, terms, limit: 5 })).toEqual([])
    const page = { bookId: id, limit: 1, offset: 0 }
    expect(await execute('listSearchTerms', page)).toEqual({
      total: 1,
      terms: [{ id: expect.any(Number), term: '검색', document_frequency: 2 }],
    })
    expect(await execute('listSearchPostings', page)).toEqual({
      total: 2,
      postings: [expect.objectContaining({ chunk_id: 'chunk-1', term_frequency: 1 })],
    })
    expect(await execute('listSearchChunks', page)).toEqual({
      total: 2,
      chunks: [expect.objectContaining({ id: 'chunk-1' })],
    })
    expect(await execute('listChunkSources', page)).toEqual({
      total: 2,
      sources: [expect.objectContaining({ chunk_id: 'chunk-1', page_number: 1 })],
    })
    await deleteBookById(db, id)
    expect(await db.sql('SELECT * FROM search_terms')).toEqual([])
    expect(await db.sql('SELECT * FROM search_postings')).toEqual([])
    expect(await db.sql('SELECT * FROM ocr_pages')).toEqual([])
  })

  it('검색 조회는 책별로 정렬·페이지네이션하고 공유 용어의 빈도와 출처 순서를 유지한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    await execute('storeSearchIndex', {
      bookId: id,
      chunks: [
        {
          ...chunk('late', pages[0].id),
          ordinal: 2,
          terms: [
            { term: 'alpha', termFrequency: 1 },
            { term: 'beta', termFrequency: 1 },
          ],
        },
        {
          ...chunk('early', pages[0].id),
          sources: [
            { ocrPageId: pages[0].id, startLineIndex: 1, endLineIndex: 2, sourceOrder: 1 },
            { ocrPageId: pages[1].id, startLineIndex: 0, endLineIndex: 0, sourceOrder: 0 },
          ],
          terms: [{ term: 'alpha', termFrequency: 1 }],
        },
      ],
    })
    await execute('storeSearchIndex', {
      bookId: otherId,
      chunks: [
        { ...chunk('other', ''), sources: [], terms: [{ term: 'alpha', termFrequency: 1 }] },
      ],
    })
    const page = { bookId: id, limit: 1, offset: 1 }
    expect(await execute('listSearchChunks', page)).toEqual({
      total: 2,
      chunks: [expect.objectContaining({ id: 'late', ordinal: 2 })],
    })
    expect(await execute('listSearchTerms', { ...page, offset: 0, limit: 10 })).toEqual({
      total: 2,
      terms: [
        { id: expect.any(Number), term: 'alpha', document_frequency: 3 },
        { id: expect.any(Number), term: 'beta', document_frequency: 1 },
      ],
    })
    expect(await execute('listSearchTerms', page)).toEqual({
      total: 2,
      terms: [{ id: expect.any(Number), term: 'beta', document_frequency: 1 }],
    })
    expect(await execute('listSearchPostings', page)).toEqual({
      total: 3,
      postings: [
        {
          term_id: expect.any(Number),
          chunk_id: 'late',
          term_frequency: 1,
          term: 'alpha',
          chunk_ordinal: 2,
        },
      ],
    })
    expect(await execute('listChunkSources', page)).toEqual({
      total: 3,
      sources: [
        {
          id: expect.any(Number),
          chunk_id: 'early',
          chunk_ordinal: 0,
          ocr_page_id: pages[0].id,
          page_number: 1,
          start_line_index: 1,
          end_line_index: 2,
          source_order: 1,
        },
      ],
    })
    expect(await execute('searchChunks', { bookId: id, terms: ['alpha'], limit: 1 })).toEqual([
      expect.objectContaining({
        id: 'early',
        sources: [
          { pageNumber: 2, startLineIndex: 0, endLineIndex: 0 },
          { pageNumber: 1, startLineIndex: 1, endLineIndex: 2 },
        ],
      }),
    ])
    for (const [command, key, total] of [
      ['listSearchChunks', 'chunks', 2],
      ['listSearchTerms', 'terms', 2],
      ['listSearchPostings', 'postings', 3],
      ['listChunkSources', 'sources', 3],
    ] as const) {
      expect(await execute(command, { ...page, offset: 10 })).toEqual({ total, [key]: [] })
      expect(await execute(command, { ...page, bookId: 'missing', offset: 0 })).toEqual({
        total: 0,
        [key]: [],
      })
    }
  })

  it('식별자가 NULL인 검색 청크는 조회 결과로 반환하지 않는다', async () => {
    const { db, id, execute } = await setup()
    await db.sql(
      "INSERT INTO search_chunks (book_id, ordinal, text, token_count, created_at) VALUES (?, 0, '청크', 1, 0)",
      id,
    )
    await expect(execute('listSearchChunks', { bookId: id, limit: 10, offset: 0 })).rejects.toThrow(
      'Invalid search chunks',
    )
  })

  it('색인을 교체하거나 책을 삭제하면 단어별 청크 수를 갱신하고 어느 청크에도 없는 단어만 삭제한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    await execute('storeSearchIndex', {
      bookId: id,
      chunks: [
        {
          ...chunk('first', pages[0].id),
          terms: [
            { term: 'shared', termFrequency: 2 },
            { term: 'old', termFrequency: 1 },
          ],
        },
        {
          ...chunk('second', pages[1].id),
          ordinal: 1,
          terms: [{ term: 'shared', termFrequency: 1 }],
        },
      ],
    })
    await execute('storeSearchIndex', {
      bookId: otherId,
      chunks: [
        {
          ...chunk('other', ''),
          sources: [],
          terms: [
            { term: 'shared', termFrequency: 3 },
            { term: 'other-only', termFrequency: 1 },
          ],
        },
      ],
    })
    const terms = () => db.sql('SELECT term, document_frequency FROM search_terms ORDER BY term')
    expect(await terms()).toEqual([
      { term: 'old', document_frequency: 1 },
      { term: 'other-only', document_frequency: 1 },
      { term: 'shared', document_frequency: 3 },
    ])
    const otherSearch = await execute('searchChunks', {
      bookId: otherId,
      terms: ['shared'],
      limit: 5,
    })
    const replacement = {
      bookId: id,
      chunks: [
        {
          ...chunk('replacement', pages[0].id),
          terms: [
            { term: 'shared', termFrequency: 4 },
            { term: 'new', termFrequency: 1 },
          ],
        },
      ],
    }
    await execute('storeSearchIndex', replacement)
    await execute('storeSearchIndex', replacement)
    expect(await terms()).toEqual([
      { term: 'new', document_frequency: 1 },
      { term: 'other-only', document_frequency: 1 },
      { term: 'shared', document_frequency: 2 },
    ])
    expect(await execute('searchChunks', { bookId: otherId, terms: ['shared'], limit: 5 })).toEqual(
      otherSearch,
    )
    await deleteBookById(db, id)
    expect(await terms()).toEqual([
      { term: 'other-only', document_frequency: 1 },
      { term: 'shared', document_frequency: 1 },
    ])
    expect(await execute('searchChunks', { bookId: otherId, terms: ['shared'], limit: 5 })).toEqual(
      otherSearch,
    )
    await execute('storeSearchIndex', { bookId: otherId, chunks: [] })
    expect(await terms()).toEqual([])
    expect(await db.sql('SELECT * FROM search_postings')).toEqual([])
    expect(await execute('getBookAnalysisStatus', otherId)).toBe('ready')
  })

  it('없는 책에는 빈 색인도 저장하지 않는다', async () => {
    const { execute } = await setup()
    await expect(
      execute('storeSearchIndex', { bookId: 'missing', chunks: [] }),
    ).rejects.toBeInstanceOf(NotFoundBookError)
  })

  it.each(['search_chunks', 'chunk_sources', 'search_terms', 'search_postings', 'books'])(
    '색인 교체 중 %s 저장에 실패하면 기존 색인과 분석 상태를 복원한다',
    async (table) => {
      const { db, id, execute, pages } = await preparePages()
      const input = { bookId: id, chunks: [chunk('chunk-1', pages[0].id)] }
      await execute('storeSearchIndex', input)
      const readState = () =>
        Promise.all(
          ['books', 'search_chunks', 'chunk_sources', 'search_terms', 'search_postings'].map(
            (name) => db.sql(`SELECT * FROM ${name} ORDER BY rowid`),
          ),
        )
      const before = await readState()
      await db.sql(
        `CREATE TRIGGER fail_write BEFORE ${table === 'books' ? 'UPDATE' : 'INSERT'} ON ${table} BEGIN SELECT RAISE(ABORT, 'index failure'); END`,
      )
      await expect(
        execute('storeSearchIndex', {
          bookId: id,
          chunks: [chunk('replacement', pages[1].id)],
        }).catch((error: unknown) => {
          throw error instanceof DrizzleQueryError ? error.cause : error
        }),
      ).rejects.toThrow('index failure')
      expect(await readState()).toEqual(before)
    },
  )

  it.each(['다른 책의', '존재하지 않는'])(
    '%s OCR 페이지를 출처로 사용하면 거부하고 기존 색인을 보존한다',
    async (source) => {
      const { db, execute, pages } = await preparePages()
      const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
      await execute('storeSearchIndex', {
        bookId: otherId,
        chunks: [{ ...chunk('existing', ''), sources: [] }],
      })
      const query = { bookId: otherId, terms: ['검색'], limit: 5 }
      const before = await execute('searchChunks', query)
      const booksBefore = await db.sql('SELECT * FROM books ORDER BY id')
      const pageId = source === '다른 책의' ? pages[0].id : 'missing'
      await expect(
        execute('storeSearchIndex', { bookId: otherId, chunks: [chunk('invalid', pageId)] }),
      ).rejects.toThrow('Chunk source does not belong to book')
      expect(await execute('searchChunks', query)).toEqual(before)
      expect(await db.sql('SELECT * FROM books ORDER BY id')).toEqual(booksBefore)
    },
  )

  it('책 삭제 중 더 이상 쓰이지 않는 검색 단어를 삭제하지 못하면 책과 색인을 함께 복원한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    await execute('storeSearchIndex', { bookId: id, chunks: [chunk('chunk-1', pages[0].id)] })
    await db.sql(
      "CREATE TRIGGER fail_cleanup BEFORE DELETE ON search_terms BEGIN SELECT RAISE(ABORT, 'cleanup failure'); END",
    )
    await expect(
      deleteBookById(db, id).catch((error: unknown) => {
        throw error instanceof DrizzleQueryError ? error.cause : error
      }),
    ).rejects.toThrow('cleanup failure')
    expect(await listBooks(db)).toHaveLength(1)
    expect(await db.sql('SELECT * FROM search_postings')).toHaveLength(1)
  })
})
