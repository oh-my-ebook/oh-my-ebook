import { PaddleOcrClient } from '@shared/lib/ocr/adapters/paddle-ocr/paddle-ocr.client'
import { ReaderOcrService } from '@shared/lib/ocr/reader-ocr.service'
import { kiwiClient } from '@shared/lib/text-analysis/adapters/kiwi/kiwi.client'
import { createWebLlmChatModel } from '@/lib/chat/adapters/web-llm/web-llm.client'
import { WebLlmProvider } from '@/lib/chat/adapters/web-llm/web-llm.provider'

export const readerOcrService = new ReaderOcrService(new PaddleOcrClient(), kiwiClient)
export const webLlmProvider = new WebLlmProvider()
export const webLlmChatModel = createWebLlmChatModel(webLlmProvider)
