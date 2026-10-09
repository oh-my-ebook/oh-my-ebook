import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookInput, createTestConnection } from '../../../test/sqlocal'
import { createBookRepository } from './book/book.repository'
import * as connection from './database-connection'
import { clearPdfFiles, deletePdf, hasPdf, readPdf, writePdf } from './book/pdf-files'

vi.mock('./database-connection', () => ({
  initializeDatabase: vi.fn(),
  resetDatabase: vi.fn(),
  get db() {
    throw new Error('Test database not configured')
  },
  get sqlocal() {
    throw new Error('Test database not configured')
  },
}))
vi.mock('./book/pdf-files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./book/pdf-files')>()),
  clearPdfFiles: vi.fn(),
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
  const db = await createTestConnection()
  vi.spyOn(connection, 'db', 'get').mockReturnValue(db.db)
  vi.spyOn(connection, 'sqlocal', 'get').mockReturnValue(db.sqlocal)
  vi.resetModules()
  const { storageService } = await import('./storage.service')
  return { db, storageService, bookRepository: createBookRepository(db) }
}

describe('책 저장 작업', () => {
  it('명시적으로 초기화한 뒤 저장과 조회에서 초기화를 반복하지 않는다', async () => {
    const { storageService } = await setup()
    await storageService.initialize()
    await storageService.saveBook(createBookInput())
    expect(await storageService.listBooks()).toHaveLength(1)
    expect(connection.initializeDatabase).toHaveBeenCalledOnce()
  })

  it('DB를 초기화한 뒤 PDF 폴더를 비운다', async () => {
    const { storageService } = await setup()
    let reset = false
    vi.mocked(connection.resetDatabase).mockImplementation(async () => {
      reset = true
    })
    vi.mocked(clearPdfFiles).mockImplementation(async () => {
      expect(reset).toBe(true)
    })
    await storageService.clearStorage()
    expect(clearPdfFiles).toHaveBeenCalledOnce()
  })

  it('DB 삭제 실패는 PDF 삭제 전에 전달하고 재시도할 수 있다', async () => {
    const { storageService } = await setup()
    vi.mocked(connection.resetDatabase).mockRejectedValueOnce(new Error('delete failed'))
    await expect(storageService.clearStorage()).rejects.toThrow('delete failed')
    expect(clearPdfFiles).not.toHaveBeenCalled()
    await expect(storageService.clearStorage()).resolves.toBeUndefined()
    expect(clearPdfFiles).toHaveBeenCalledOnce()
  })

  it('PDF 전체 삭제 실패를 전달하고 재시도할 수 있다', async () => {
    const { storageService } = await setup()
    vi.mocked(clearPdfFiles).mockRejectedValueOnce(new Error('pdf delete failed'))
    await expect(storageService.clearStorage()).rejects.toThrow('pdf delete failed')
    await expect(storageService.clearStorage()).resolves.toBeUndefined()
  })

  it('잘못된 책 입력은 DB를 열지 않는다', async () => {
    const { storageService } = await setup()
    for (const payload of [
      createBookInput({ pdfSize: -1 }),
      createBookInput({ contentHash: ' ' }),
    ]) {
      await expect(storageService.saveBook(payload)).rejects.toThrow('Invalid input')
    }
    expect(connection.initializeDatabase).not.toHaveBeenCalled()
  })

  it('PDF 원본은 파일로 저장하고 메타데이터만 DB에 저장한다', async () => {
    const { db, storageService, bookRepository } = await setup()
    const input = createBookInput({ author: '저자', publisher: '출판사', pdfTitle: '원본 제목' })
    const id = await storageService.saveBook(input)
    expect(writePdf).toHaveBeenCalledWith(input.contentHash, input.pdfData)
    expect(await bookRepository.listBooks()).toEqual([
      expect.objectContaining({
        id,
        author: '저자',
        publisher: '출판사',
        pdf_title: '원본 제목',
        analysis_status: 'analyzing',
      }),
    ])
    expect(
      await db.sqlocal.sql("SELECT name FROM pragma_table_info('books') WHERE name = 'pdf_data'"),
    ).toEqual([])
  })

  it('DB 저장 실패 시 PDF 파일을 만들지 않는다', async () => {
    const { db, storageService, bookRepository } = await setup()
    await db.sqlocal.sql(
      "CREATE TRIGGER fail_book BEFORE INSERT ON books BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    )
    await expect(storageService.saveBook(createBookInput())).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('disk failure') }),
    })
    expect(writePdf).not.toHaveBeenCalled()
    expect(await bookRepository.listBooks()).toEqual([])
  })

  it('PDF 저장 실패 시 방금 추가한 책 정보도 제거한다', async () => {
    const { storageService, bookRepository } = await setup()
    vi.mocked(writePdf).mockRejectedValueOnce(new Error('write failed'))
    await expect(storageService.saveBook(createBookInput())).rejects.toThrow('write failed')
    expect(await bookRepository.listBooks()).toEqual([])
  })

  it('목록에 PDF 원본 존재 여부를 포함하고 책 조회 시 원본을 읽는다', async () => {
    const { storageService, bookRepository } = await setup()
    const id = await bookRepository.addBook(createBookInput())
    await bookRepository.addBook(createBookInput({ contentHash: 'b'.repeat(64) }))
    vi.mocked(hasPdf).mockImplementation(async (hash) => hash === 'a'.repeat(64))
    vi.mocked(readPdf).mockResolvedValue(new Uint8Array([1, 2, 3]))
    expect(await storageService.listBooks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, pdf_status: 'available' }),
        expect.objectContaining({ content_hash: 'b'.repeat(64), pdf_status: 'missing' }),
      ]),
    )
    expect(await storageService.getBook(id)).toMatchObject({
      id,
      pdf_data: new Uint8Array([1, 2, 3]),
    })
    expect(readPdf).toHaveBeenCalledWith('a'.repeat(64))
  })

  it('PDF 삭제가 실패하면 책 정보는 유지하고 성공하면 함께 지운다', async () => {
    const { storageService, bookRepository } = await setup()
    const id = await bookRepository.addBook(createBookInput())
    vi.mocked(deletePdf).mockRejectedValueOnce(new Error('delete failed'))
    await expect(storageService.deleteBook(id)).rejects.toThrow('delete failed')
    expect(await bookRepository.getBookMetadata(id)).toMatchObject({ id })
    await storageService.deleteBook(id)
    expect(await bookRepository.listBooks()).toEqual([])
    expect(deletePdf).toHaveBeenCalledWith('a'.repeat(64))
  })

  it('저장소 메서드의 입력 검증과 없는 책 오류를 유지한다', async () => {
    const { storageService } = await setup()
    await expect(
      storageService.updateCover({
        id: '',
        coverData: new ArrayBuffer(1),
        coverMime: 'image/png',
      }),
    ).rejects.toThrow('Invalid input for updateCover')
    await expect(storageService.hasBook('missing')).rejects.toThrow()
    await expect(storageService.getBook('missing')).rejects.toThrow()
  })

  it('범위를 벗어난 입력은 DB에 전달하지 않는다', async () => {
    const { storageService } = await setup()
    await expect(storageService.updateProgress({ id: 'book', page: 0 })).rejects.toThrow(
      'Invalid input',
    )
    await expect(storageService.updateTitle({ id: 'book', title: ' ' })).rejects.toThrow(
      'Invalid input',
    )
    await expect(
      storageService.initializeOcrPages({ bookId: 'book', pageCount: -1 }),
    ).rejects.toThrow('Invalid input')
    await expect(
      storageService.storeOcrPage({ pageId: 'page', width: 0, height: 100, lines: [] }),
    ).rejects.toThrow('Invalid input')
    await expect(
      storageService.listSearchTerms({ bookId: 'book', limit: 10, offset: -1 }),
    ).rejects.toThrow('Invalid input')
    await expect(
      storageService.searchChunks({ bookId: 'book', terms: ['검색'], limit: 6 }),
    ).rejects.toThrow('Invalid input')
    expect(connection.initializeDatabase).not.toHaveBeenCalled()
  })

  it('DB에 손상된 콘텐츠 해시가 있으면 PDF 파일에 접근하지 않는다', async () => {
    const { db, storageService, bookRepository } = await setup()
    const id = await bookRepository.addBook(createBookInput())
    await db.sqlocal.sql('UPDATE books SET content_hash = ? WHERE id = ?', '../unexpected', id)
    await expect(storageService.listBooks()).rejects.toThrow('Invalid content hash')
    await expect(storageService.getBook(id)).rejects.toThrow('Invalid content hash')
    await expect(storageService.deleteBook(id)).rejects.toThrow('Invalid content hash')
    expect(hasPdf).not.toHaveBeenCalled()
    expect(readPdf).not.toHaveBeenCalled()
    expect(deletePdf).not.toHaveBeenCalled()
    expect(await bookRepository.listBooks()).toHaveLength(1)
  })
})
