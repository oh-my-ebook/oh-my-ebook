import { describe, expect, it } from 'vitest'
import { createTestConnection } from '../../test/sqlocal'
import { booksTable, searchTermsTable } from './schema'

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
      coverStatus: 'ready',
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
