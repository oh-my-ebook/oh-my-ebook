import { expect, it } from 'vitest'
import { createNewBook, createTestConnection } from '@/test/sqlocal'
import { createBookRepository } from './book.repository'
import { createBookService } from './book.service'

it('전달받은 PDF 파일 저장소에서 책 원본을 읽는다', async () => {
  const connection = await createTestConnection()
  const repository = createBookRepository(connection)
  const book = createNewBook()
  await repository.addBook(book)
  const pdfData = new Uint8Array([1, 2, 3])
  const bookService = createBookService(repository, {
    writePdf: async () => undefined,
    readPdf: async () => pdfData,
    hasPdf: async () => true,
    deletePdf: async () => undefined,
  })

  const result = await bookService.getBook(book.id)

  expect(result.pdfData).toEqual(pdfData)
})
