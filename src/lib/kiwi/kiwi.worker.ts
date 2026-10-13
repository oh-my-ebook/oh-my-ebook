/// <reference lib="webworker" />

import { Match } from 'kiwi-nlp'
import { extractSearchTerms, normalizeText } from './kiwi.util'
import { KIWI_REQUEST } from './kiwi.const'
import { KiwiProvider } from './kiwi.provider'
import type { KiwiTools, KiwiWorkerRequest, KiwiWorkerResponse } from './kiwi.types'

const provider = new KiwiProvider()

self.onmessage = ({ data }: MessageEvent<KiwiWorkerRequest>) => handleRequest(data, provider)

async function handleRequest(data: KiwiWorkerRequest, provider: KiwiProvider): Promise<void> {
  try {
    const kiwiAnalyzer = await provider.getKiwi()
    const tools: KiwiTools = {
      tokenize: (text: string) => kiwiAnalyzer.tokenize(text, Match.allWithNormalizing),
      joinSent: (morphs: Array<{ form: string; tag: string }>) =>
        kiwiAnalyzer.joinSent(morphs, true),
    }

    switch (data.type) {
      // 형태소 분석 결과를 정규화하여 문장 단위로 합친다.
      case KIWI_REQUEST.NORMALIZE_TEXT: {
        const text = normalizeText(tools, data.text)
        self.postMessage({
          id: data.id,
          ok: true,
          type: data.type,
          text,
        } satisfies KiwiWorkerResponse)
        break
      }

      // 형태소 분석 결과에서 검색어 후보를 추출한다.
      case KIWI_REQUEST.EXTRACT_SEARCH_TERMS: {
        const terms = extractSearchTerms(tools, data.text)
        self.postMessage({
          id: data.id,
          ok: true,
          type: data.type,
          terms,
        } satisfies KiwiWorkerResponse)
        break
      }

      default:
        throw new Error(`Unknown request type: ${data.type}`)
    }
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      type: data.type,
      error: error instanceof Error ? error.message : String(error),
    } satisfies KiwiWorkerResponse)
  }
}
