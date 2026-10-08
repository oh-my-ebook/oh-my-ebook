import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookInput, createTestDatabase } from '../../../test/sqlocal'
import { addBook, getBookMetadata, listBooks } from './database'
import { getDatabase, closeDatabase } from './database-connection'
import { executeCommand } from './operations'
import { clearOpfs, deletePdf, hasPdf, readPdf, writePdf } from './pdf-files'

vi.mock('./database-connection', () => ({ getDatabase: vi.fn(), closeDatabase: vi.fn() }))
vi.mock('./pdf-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pdf-files')>()),
  clearOpfs: vi.fn(),
  deletePdf: vi.fn(),
  hasPdf: vi.fn(),
  readPdf: vi.fn(),
  writePdf: vi.fn(),
}))
afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

async function setup() {
  const db = await createTestDatabase()
  vi.mocked(getDatabase).mockResolvedValue(db)
  return db
}

describe('책 저장 작업', () => {
  it('DB 연결을 닫은 뒤 PDF를 포함한 저장소를 비운다', async () => {
    let closed = false
    vi.mocked(closeDatabase).mockImplementation(async () => {
      closed = true
    })
    vi.mocked(clearOpfs).mockImplementation(async () => {
      expect(closed).toBe(true)
    })
    await executeCommand({ command: 'clearStorage' })
    expect(clearOpfs).toHaveBeenCalledOnce()
  })

  it('알 수 없는 명령과 잘못된 책 입력은 DB를 열지 않는다', async () => {
    await expect(executeCommand({ command: 'unknown' })).rejects.toThrow('Unsupported command')
    for (const payload of [
      { title: '불완전' },
      createBookInput({ pdfSize: -1 }),
      createBookInput({ contentHash: ' ' }),
    ]) {
      await expect(executeCommand({ command: 'saveBook', payload })).rejects.toThrow(
        'Invalid payload',
      )
    }
    expect(getDatabase).not.toHaveBeenCalled()
  })

  it('PDF 원본은 파일로 저장하고 메타데이터만 DB에 저장한다', async () => {
    const db = await setup()
    const input = createBookInput({ author: '저자', publisher: '출판사', pdfTitle: '원본 제목' })
    const id = await executeCommand({ command: 'saveBook', payload: input })
    expect(writePdf).toHaveBeenCalledWith(input.contentHash, input.pdfData)
    expect(await listBooks(db)).toEqual([
      expect.objectContaining({
        id,
        author: '저자',
        publisher: '출판사',
        pdf_title: '원본 제목',
        analysis_status: 'analyzing',
      }),
    ])
    expect(
      await db.sql("SELECT name FROM pragma_table_info('books') WHERE name = 'pdf_data'"),
    ).toEqual([])
  })

  it('DB 저장 실패 시 PDF 파일을 만들지 않는다', async () => {
    const db = await setup()
    await db.sql(
      "CREATE TRIGGER fail_book BEFORE INSERT ON books BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    )
    await expect(
      executeCommand({ command: 'saveBook', payload: createBookInput() }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('disk failure') }),
    })
    expect(writePdf).not.toHaveBeenCalled()
    expect(await listBooks(db)).toEqual([])
  })

  it('PDF 저장 실패 시 방금 추가한 책 정보도 제거한다', async () => {
    const db = await setup()
    vi.mocked(writePdf).mockRejectedValueOnce(new Error('write failed'))
    await expect(
      executeCommand({ command: 'saveBook', payload: createBookInput() }),
    ).rejects.toThrow('write failed')
    expect(await listBooks(db)).toEqual([])
  })

  it('목록에 PDF 원본 존재 여부를 포함하고 책 조회 시 원본을 읽는다', async () => {
    const db = await setup()
    const id = await addBook(db, createBookInput())
    await addBook(db, createBookInput({ contentHash: 'b'.repeat(64) }))
    vi.mocked(hasPdf).mockImplementation(async (hash) => hash === 'a'.repeat(64))
    vi.mocked(readPdf).mockResolvedValue(new Uint8Array([1, 2, 3]))
    expect(await executeCommand({ command: 'listBooks' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, pdf_status: 'available' }),
        expect.objectContaining({ content_hash: 'b'.repeat(64), pdf_status: 'missing' }),
      ]),
    )
    expect(await executeCommand({ command: 'getBook', payload: id })).toMatchObject({
      id,
      pdf_data: new Uint8Array([1, 2, 3]),
    })
    expect(readPdf).toHaveBeenCalledWith('a'.repeat(64))
  })

  it('PDF 삭제가 실패하면 책 정보는 유지하고 성공하면 함께 지운다', async () => {
    const db = await setup()
    const id = await addBook(db, createBookInput())
    vi.mocked(deletePdf).mockRejectedValueOnce(new Error('delete failed'))
    await expect(executeCommand({ command: 'deleteBook', payload: id })).rejects.toThrow(
      'delete failed',
    )
    expect(await getBookMetadata(db, id)).toMatchObject({ id })
    await executeCommand({ command: 'deleteBook', payload: id })
    expect(await listBooks(db)).toEqual([])
    expect(deletePdf).toHaveBeenCalledWith('a'.repeat(64))
  })

  it('SQL 명령의 입력 검증과 없는 책 오류를 유지한다', async () => {
    await setup()
    await expect(executeCommand({ command: 'updateCover', payload: { id: '' } })).rejects.toThrow(
      'Invalid payload for updateCover',
    )
    await expect(executeCommand({ command: 'hasBook', payload: 'missing' })).rejects.toThrow()
    await expect(executeCommand({ command: 'getBook', payload: 'missing' })).rejects.toThrow()
  })
})
