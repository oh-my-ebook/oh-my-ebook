/// <reference lib="webworker" />

import { Match } from 'kiwi-nlp'
import { extractSearchTerms, normalizeText } from './kiwi.util'
import { KIWI_REQUEST } from './kiwi.const'
import { KiwiProvider } from './kiwi.provider'
import type { KiwiTextAnalyzer, KiwiWorkerRequest, KiwiWorkerResponse } from './kiwi.types'

const kiwiProvider = new KiwiProvider()

self.onmessage = ({ data }: MessageEvent<KiwiWorkerRequest>) => handleRequest(data)

async function handleRequest(request: KiwiWorkerRequest): Promise<void> {
  try {
    const kiwi = await kiwiProvider.getKiwi()
    const analyzer: KiwiTextAnalyzer = {
      tokenize: (text) => kiwi.tokenize(text, Match.allWithNormalizing),
      joinSentence: (morphemes) => kiwi.joinSent(morphemes, true),
    }

    switch (request.type) {
      // 형태소 분석 결과를 정규화하여 문장 단위로 합친다.
      case KIWI_REQUEST.NORMALIZE_TEXT: {
        const text = normalizeText(analyzer, request.text)
        self.postMessage({
          id: request.id,
          ok: true,
          type: request.type,
          text,
        } satisfies KiwiWorkerResponse)
        break
      }

      // 형태소 분석 결과에서 검색어 후보를 추출한다.
      case KIWI_REQUEST.EXTRACT_SEARCH_TERMS: {
        const terms = extractSearchTerms(analyzer, request.text)
        self.postMessage({
          id: request.id,
          ok: true,
          type: request.type,
          terms,
        } satisfies KiwiWorkerResponse)
        break
      }

      default:
        throw new Error(`Unknown request type: ${request.type}`)
    }
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      type: request.type,
      error: error instanceof Error ? error.message : String(error),
    } satisfies KiwiWorkerResponse)
  }
}
