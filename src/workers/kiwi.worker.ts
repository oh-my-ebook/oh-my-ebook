/// <reference lib="webworker" />

import { KiwiBuilder, Match, type Kiwi } from 'kiwi-nlp'
import { extractSearchTerms, postprocessKiwiText } from '../lib/kiwi/postprocess'

const modelNames = ['combiningRule.txt', 'extract.mdl', 'sj.morph', 'cong.mdl', 'nounchr.mdl']
let kiwi: Promise<Kiwi> | undefined

type KiwiWorkerRequest =
  | { id: number; type: 'postprocess'; text: string }
  | { id: number; type: 'extract-search-terms'; text: string }

function getKiwi() {
  kiwi ??= KiwiBuilder.create('/kiwi/kiwi-wasm.wasm').then((builder) =>
    builder.build({
      modelFiles: Object.fromEntries(modelNames.map((name) => [name, `/kiwi/model/${name}`])),
      modelType: 'cong',
      loadDefaultDict: false,
      loadMultiDict: false,
      loadTypoDict: false,
    }),
  )
  return kiwi
}

self.onmessage = async ({ data }: MessageEvent<KiwiWorkerRequest>) => {
  try {
    const analyzer = await getKiwi()
    const tools = {
      tokenize: (text: string) => analyzer.tokenize(text, Match.allWithNormalizing),
      joinSent: (morphs: Array<{ form: string; tag: string }>) => analyzer.joinSent(morphs, true),
    }

    if (data.type === 'postprocess') {
      const text = postprocessKiwiText(tools, data.text)
      self.postMessage({ id: data.id, ok: true, type: data.type, text })
      return
    }

    self.postMessage({
      id: data.id,
      ok: true,
      type: data.type,
      terms: extractSearchTerms(tools, data.text),
    })
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      type: data.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
