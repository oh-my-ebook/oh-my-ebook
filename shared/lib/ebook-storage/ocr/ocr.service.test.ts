import { expect, it } from 'vitest'
import { createStoreMock } from '@/test/ebook-store'
import { createOcrService } from './ocr.service'

it('전달받은 repository 객체가 보관한 OCR 결과를 조회한다', async () => {
  const repository = {
    ...createStoreMock(),
    storedPage: {
      width: 600,
      height: 900,
      lines: [{ rawText: '저장된 원문', x0: 10, y0: 20, x1: 200, y1: 40 }],
    },
    async getStoredOcrPage() {
      return this.storedPage
    },
  }
  const ocrService = createOcrService(repository)

  await expect(ocrService.getStoredOcrPage({ bookId: 'book-id', pageNumber: 1 })).resolves.toEqual(
    repository.storedPage,
  )
})
