import { PaddleOcrClient } from '@shared/lib/ocr/adapters/paddle-ocr/paddle-ocr.client'
import { ReaderOcrService } from '@shared/lib/ocr/reader-ocr.service'
import { kiwiClient } from '@/lib/kiwi/kiwi.client'

export const readerOcrService = new ReaderOcrService(new PaddleOcrClient(), kiwiClient)
