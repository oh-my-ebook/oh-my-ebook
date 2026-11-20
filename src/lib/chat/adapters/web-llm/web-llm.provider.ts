import { createStore } from 'zustand/vanilla'
import type { WebLlmEngine, WebLlmModelState } from './web-llm.type'
import { assertWebGpuSupport, getLoadingProgress, getModelErrorMessage } from './web-llm.util'

export const WEBLLM_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

export class WebLlmProvider {
  readonly modelStore = createStore<WebLlmModelState>(() => ({
    status: 'idle',
    progress: 0,
    phase: 'preparing',
  }))

  private enginePromise: Promise<WebLlmEngine> | undefined
  private worker: Worker | undefined

  async prepareModel() {
    await this.loadEngine()
  }

  async prepareCachedModel() {
    if (typeof caches === 'undefined' || this.modelStore.getState().status !== 'idle') return
    if (!(await caches.has('webllm/model'))) return

    const { hasModelInCache } = await import('@mlc-ai/web-llm')
    // 일부만 받은 모델은 자동 다운로드하지 않는다. 라이브러리가 모든 가중치 파일을 확인한다.
    const cached = await hasModelInCache(WEBLLM_MODEL_ID)
    if (cached && this.modelStore.getState().status === 'idle') {
      await this.loadEngine()
    }
  }

  // 캐시가 없는 모델 다운로드는 사용자가 다운로드 버튼으로 명시적으로 시작해야 한다.
  // 채팅 요청이 로딩을 대신 시작하면 idle·error 상태에서 질문만 보내도 수백 MB 다운로드가 시작된다.
  async getReadyEngine() {
    if (this.modelStore.getState().status !== 'ready' || !this.enginePromise) {
      throw new Error('모델이 준비되지 않았습니다. 먼저 모델을 다운로드해 주세요.')
    }

    return this.enginePromise
  }

  invalidateEngine(error: unknown) {
    this.worker?.terminate()
    this.worker = undefined
    this.enginePromise = undefined
    this.modelStore.setState({ status: 'error', error: getModelErrorMessage(error) })
  }

  private loadEngine() {
    if (!this.enginePromise) {
      this.modelStore.setState({
        status: 'loading',
        phase: 'preparing',
        progress: 0,
        progressDetail: undefined,
        error: undefined,
      })
      this.enginePromise = this.createEngine().then(
        (engine) => {
          this.modelStore.setState({ status: 'ready', progress: 100 })
          return engine
        },
        (error: unknown) => {
          this.invalidateEngine(error)
          throw error
        },
      )
    }

    return this.enginePromise
  }

  private async createEngine(): Promise<WebLlmEngine> {
    await assertWebGpuSupport()

    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
    const currentWorker = new Worker(new URL('./web-llm.worker.ts', import.meta.url), {
      type: 'module',
    })
    this.worker = currentWorker
    const workerFailed = new Promise<never>((_, reject) => {
      currentWorker.addEventListener(
        'error',
        () => reject(new Error('AI 실행 파일을 불러오지 못했습니다.')),
        { once: true },
      )
    })

    return Promise.race([
      CreateWebWorkerMLCEngine(
        currentWorker,
        WEBLLM_MODEL_ID,
        {
          initProgressCallback: (report) => {
            this.modelStore.setState(getLoadingProgress(report))
          },
        },
        { context_window_size: 8192 },
      ),
      workerFailed,
    ])
  }
}
