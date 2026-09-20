import { WEBLLM_MODEL_URL } from './webllm-config'
import type { TokenCounter } from './webllm-context'

let counterPromise: Promise<TokenCounter> | undefined

async function createTokenCounter(): Promise<TokenCounter> {
  const { Tokenizer } = await import('@mlc-ai/web-tokenizers')
  const url = `${WEBLLM_MODEL_URL}tokenizer.json`
  // 모델 준비 후 호출하므로 WebLLM이 이미 받은 사전을 같은 캐시에서 읽는다.
  const cache = await globalThis.caches?.open('webllm/model')
  const response = (await cache?.match(url)) ?? (await fetch(url))
  if (!response.ok) throw new Error(`토크나이저를 불러오지 못했습니다 (${response.status}).`)
  const tokenizer = await Tokenizer.fromJSON(await response.arrayBuffer())
  return (text) => tokenizer.encode(text).length
}

export function loadWebLlmTokenCounter() {
  if (!counterPromise) {
    counterPromise = createTokenCounter().catch((error: unknown) => {
      counterPromise = undefined
      throw error
    })
  }
  return counterPromise
}
