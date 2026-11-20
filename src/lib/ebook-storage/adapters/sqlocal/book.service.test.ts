import { expect, it } from 'vitest'
import { createNewBook, createTestConnection } from '@/test/sqlocal'
import { createBookRepository } from './book.repository'
import { createBookService } from '@shared/lib/ebook-storage/book/book.service'

function createPdfFileStore(pdfData = new Uint8Array()) {
  return {
    writePdf: async () => undefined,
    readPdf: async () => pdfData,
    hasPdf: async () => true,
    deletePdf: async () => undefined,
  }
}

it('전달받은 PDF 파일 저장소에서 책 원본을 읽는다', async () => {
  const connection = await createTestConnection()
  const repository = createBookRepository(connection)
  const book = createNewBook()
  await repository.addBook(book)
  const pdfData = new Uint8Array([1, 2, 3])
  const bookService = createBookService(repository, createPdfFileStore(pdfData))

  const result = await bookService.getBook(book.id)

  expect(result.pdfData).toEqual(pdfData)
})

it('전달받은 repository가 조회한 책의 분석 상태를 반환한다', async () => {
  const repository = createBookRepository(await createTestConnection())
  const book = createNewBook({ analysisStatus: 'ready' })
  await repository.addBook(book)
  const bookService = createBookService(
    {
      ...repository,
      async getBookAnalysisStatus(bookId) {
        const details = await this.getBookDetails(bookId)
        return details.analysisStatus
      },
    },
    createPdfFileStore(),
  )

  await expect(bookService.getBookAnalysisStatus(book.id)).resolves.toBe('ready')
})
