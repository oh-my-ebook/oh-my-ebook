import { describe, expect, it } from 'vitest'
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
    const lines = [{ rawText: '첫 줄', x0: 1, y0: 2, x1: 3, y1: 4 }]
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
      total: 1,
      lines: [{ page_number: 1, line_index: 0, raw_text: '첫 줄', x0: 1, y0: 2, x1: 3, y1: 4 }],
    })
    expect(await execute('getOcrLinesForChunking')).toEqual([
      { ocr_page_id: pages[0].id, page_number: 1, line_index: 0, raw_text: '첫 줄' },
    ])
    expect(await db.sql('SELECT ocr_completed_at FROM books')).toEqual([
      { ocr_completed_at: expect.any(Number) },
    ])
  })

  it('OCR 저장 중 오류가 발생하면 기존 줄과 페이지 상태를 보존한다', async () => {
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
    const before = await db.sql('SELECT * FROM ocr_lines')
    await db.sql(
      "CREATE TRIGGER fail_page BEFORE UPDATE ON ocr_pages BEGIN SELECT RAISE(ABORT, 'page failure'); END",
    )
    await expect(execute('storeOcrPage', { ...input, lines: [] })).rejects.toThrow('page failure')
    expect(await db.sql('SELECT * FROM ocr_lines')).toEqual(before)
  })

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

  it.each(['search_chunks', 'search_postings'])(
    '색인 교체 중 %s 저장에 실패하면 기존 색인과 분석 상태를 복원한다',
    async (table) => {
      const { db, id, execute, pages } = await preparePages()
      const input = { bookId: id, chunks: [chunk('chunk-1', pages[0].id)] }
      await execute('storeSearchIndex', input)
      const before = await db.sql('SELECT * FROM search_chunks')
      await db.sql(
        `CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'index failure'); END`,
      )
      await expect(
        execute('storeSearchIndex', { bookId: id, chunks: [chunk('replacement', pages[1].id)] }),
      ).rejects.toThrow('index failure')
      expect(await db.sql('SELECT * FROM search_chunks')).toEqual(before)
      expect(await execute('getBookAnalysisStatus')).toBe('ready')
    },
  )

  it('다른 책의 OCR 페이지를 색인 출처로 저장하지 않는다', async () => {
    const { db, id, execute, pages } = await preparePages()
    const otherId = await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    await expect(
      execute('storeSearchIndex', { bookId: otherId, chunks: [chunk('invalid', pages[0].id)] }),
    ).rejects.toThrow('Chunk source does not belong to book')
    expect(await db.sql('SELECT * FROM search_chunks')).toEqual([])
    expect(await getBookMetadata(db, id)).toBeDefined()
  })

  it('책 삭제 중 용어 정리가 실패하면 책과 색인을 함께 복원한다', async () => {
    const { db, id, execute, pages } = await preparePages()
    await execute('storeSearchIndex', { bookId: id, chunks: [chunk('chunk-1', pages[0].id)] })
    await db.sql(
      "CREATE TRIGGER fail_cleanup BEFORE DELETE ON search_terms BEGIN SELECT RAISE(ABORT, 'cleanup failure'); END",
    )
    await expect(deleteBookById(db, id)).rejects.toThrow('cleanup failure')
    expect(await listBooks(db)).toHaveLength(1)
    expect(await db.sql('SELECT * FROM search_postings')).toHaveLength(1)
  })
})
