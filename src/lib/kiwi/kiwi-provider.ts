import { KiwiBuilder, type Kiwi } from 'kiwi-nlp'
import { KIWI_MODEL_FILES } from './const'

export class KiwiProvider {
  private kiwiPromise: Promise<Kiwi> | undefined

  getKiwi(): Promise<Kiwi> {
    if (this.kiwiPromise) return this.kiwiPromise

    this.kiwiPromise = this.initialize()
    return this.kiwiPromise
  }

  private async initialize(): Promise<Kiwi> {
    try {
      return await this.loadKiwi()
    } catch (error) {
      this.kiwiPromise = undefined
      throw error
    }
  }

  private async loadKiwi(): Promise<Kiwi> {
    const builder = await KiwiBuilder.create('/kiwi/kiwi-wasm.wasm')

    return await builder.build({
      modelFiles: Object.fromEntries(KIWI_MODEL_FILES.map((name) => [name, `/kiwi/model/${name}`])),
      modelType: 'cong',
      loadDefaultDict: false,
      loadMultiDict: false,
      loadTypoDict: false,
    })
  }
}
