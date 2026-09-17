/// <reference lib="webworker" />

import { KiwiBuilder, Match, type Kiwi } from 'kiwi-nlp'
import { postprocessKiwiText } from '../lib/kiwi/postprocess'

const modelNames = ['combiningRule.txt', 'extract.mdl', 'sj.morph', 'cong.mdl', 'nounchr.mdl']
let kiwi: Promise<Kiwi> | undefined

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

self.onmessage = async ({ data }: MessageEvent<{ id: number; text: string }>) => {
  try {
    const analyzer = await getKiwi()
    const text = postprocessKiwiText(
      {
        tokenize: (line) => analyzer.tokenize(line, Match.allWithNormalizing),
        joinSent: (morphs) => analyzer.joinSent(morphs, true),
      },
      data.text,
    )
    self.postMessage({ id: data.id, ok: true, text })
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
