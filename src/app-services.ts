import { PaddleOcrClient } from '@/lib/ocr/adapters/paddle-ocr/paddle-ocr.client'
import { ReaderOcrService } from '@shared/lib/ocr/reader-ocr.service'
import { kiwiClient } from '@shared/lib/text-analysis/adapters/kiwi/kiwi.client'

export const readerOcrService = new ReaderOcrService(new PaddleOcrClient(), kiwiClient)
