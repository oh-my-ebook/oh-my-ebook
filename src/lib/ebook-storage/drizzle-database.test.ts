import { eq } from 'drizzle-orm'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { createNewBook, createTestConnection } from '../../test/sqlocal'
import { booksTable, ocrPagesTable, searchTermsTable } from './schema'

describe('Drizzle 저장 시각', () => {
  it('등록 시 생성·수정 시각을 밀리초로 채우고 분석 완료 시각은 비워 둔다', async () => {
    const { db } = await createTestConnection()
    const now = 1_800_000_000_123
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    onTestFinished(() => clock.mockRestore())

    await db.insert(booksTable).values({
      id: 'book',
      contentHash: 'a'.repeat(64),
      fileName: 'book.pdf',
      title: '책',
      pdfSize: 3,
      pageCount: 2,
      analysisStatus: 'analyzing',
    })

    expect(await db.query.booksTable.findFirst()).toMatchObject({
      createdAt: now,
      updatedAt: now,
      ocrCompletedAt: null,
      indexedAt: null,
    })
  })

  it('수정 시 updatedAt만 갱신하고 등록·분석 완료 시각은 보존한다', async () => {
    const { db } = await createTestConnection()
    const book = createNewBook({
      createdAt: 100,
      updatedAt: 200,
      ocrCompletedAt: 150,
      indexedAt: 180,
    })
    await db.insert(booksTable).values(book)
    const now = 1_800_000_000_456
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    onTestFinished(() => clock.mockRestore())

    await db.update(booksTable).set({ title: '새 제목' }).where(eq(booksTable.id, book.id))

    expect(await db.query.booksTable.findFirst()).toMatchObject({
      title: '새 제목',
      createdAt: 100,
      updatedAt: now,
      ocrCompletedAt: 150,
      indexedAt: 180,
    })
  })

  it('SQLocal batch와 트랜잭션에서도 Drizzle의 자동 시각을 저장한다', async () => {
    const { db, sqlocal } = await createTestConnection()
    const book = createNewBook()
    await db.insert(booksTable).values(book)
    const createdAt = 1_800_000_000_123
    const updatedAt = 1_800_000_000_456
    const clock = vi.spyOn(Date, 'now').mockReturnValue(createdAt)
    onTestFinished(() => clock.mockRestore())
    const insertQuery = db
      .insert(ocrPagesTable)
      .values({ id: 'page', bookId: book.id, pageNumber: 1 })
      .toSQL()

    await sqlocal.batch(() => [insertQuery])
    clock.mockReturnValue(updatedAt)
    await sqlocal.transaction(async (tx) => {
      const updateQuery = db
        .update(ocrPagesTable)
        .set({ status: 'processing' })
        .where(eq(ocrPagesTable.id, 'page'))
      await tx.query(updateQuery)
    })

    expect(await db.query.ocrPagesTable.findFirst()).toMatchObject({
      status: 'processing',
      createdAt,
      updatedAt,
    })
  })
})

describe('Drizzle 관계 조회 연결', () => {
  it('없는 행의 단건 조회는 undefined를 반환한다', async () => {
    const { db } = await createTestConnection()

    expect(await db.query.booksTable.findFirst()).toBeUndefined()
    expect(await db.query.booksTable.findMany()).toEqual([])
    expect(await db.select().from(booksTable).get()).toBeUndefined()
  })

  it('스키마 필드명과 선택 컬럼, BLOB을 보존한다', async () => {
    const { db } = await createTestConnection()
    const coverData = new Uint8Array([0, 128, 255])
    await db.insert(booksTable).values({
      id: 'book',
      contentHash: 'a'.repeat(64),
      fileName: 'book.pdf',
      title: '책',
      pdfSize: 3,
      pageCount: 2,
      coverData,
      analysisStatus: 'analyzing',
      createdAt: 1,
      updatedAt: 1,
    })

    expect(
      await db.query.booksTable.findFirst({
        where: { id: 'book' },
        columns: { id: true, pageCount: true, coverData: true },
      }),
    ).toEqual({ id: 'book', pageCount: 2, coverData })
    expect(await db.query.booksTable.findMany({ columns: { title: true, author: true } })).toEqual([
      { title: '책', author: null },
    ])
  })

  it('batch에서 정상 단건, 없는 단건과 목록을 각각 복원한다', async () => {
    const { db } = await createTestConnection()
    await db.insert(searchTermsTable).values({ term: '검색', documentFrequency: 1 })

    const results = await db.batch([
      db.query.searchTermsTable.findFirst({ columns: { term: true, documentFrequency: true } }),
      db.query.searchTermsTable.findFirst({ where: { term: '없는 용어' } }),
      db.query.searchTermsTable.findMany({ columns: { term: true } }),
    ])

    expect(results).toEqual([{ term: '검색', documentFrequency: 1 }, undefined, [{ term: '검색' }]])
  })
})
