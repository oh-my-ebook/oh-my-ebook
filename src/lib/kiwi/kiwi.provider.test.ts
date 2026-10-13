import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'

function createBuilderStub() {
  const kiwi = {}
  const initialization = createPromiseController<typeof kiwi>()
  const build = vi.fn(async () => await initialization.promise)
  const create = vi.fn(async () => ({ build }))

  vi.doMock('kiwi-nlp', () => ({ KiwiBuilder: { create } }))

  return { kiwi, initialization, build, create }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('kiwi-nlp')
})

describe('KiwiProvider', () => {
  it('첫 요청에서 모델을 초기화하고 대기 중인 요청과 이후 요청이 같은 Kiwi를 사용한다', async () => {
    const { kiwi, initialization, build, create } = createBuilderStub()
    const { KiwiProvider } = await import('./kiwi.provider')
    const provider = new KiwiProvider()
    expect(create).not.toHaveBeenCalled()

    const first = provider.getKiwi()
    const second = provider.getKiwi()
    initialization.resolve(kiwi)

    await expect(first).resolves.toBe(kiwi)
    await expect(second).resolves.toBe(kiwi)
    await expect(provider.getKiwi()).resolves.toBe(kiwi)
    expect(create).toHaveBeenCalledExactlyOnceWith('/kiwi/kiwi-wasm.wasm')
    expect(build).toHaveBeenCalledExactlyOnceWith({
      modelFiles: {
        'combiningRule.txt': '/kiwi/model/combiningRule.txt',
        'extract.mdl': '/kiwi/model/extract.mdl',
        'sj.morph': '/kiwi/model/sj.morph',
        'cong.mdl': '/kiwi/model/cong.mdl',
        'nounchr.mdl': '/kiwi/model/nounchr.mdl',
      },
      modelType: 'cong',
      loadDefaultDict: false,
      loadMultiDict: false,
      loadTypoDict: false,
    })
  })

  it.each(['WASM 로드', '모델 생성'])('%s 실패 후 다음 요청에서 재시도한다', async (stage) => {
    const { kiwi, initialization, build, create } = createBuilderStub()
    const error = new Error(`${stage} 실패`)
    if (stage === 'WASM 로드') create.mockRejectedValueOnce(error)
    else build.mockRejectedValueOnce(error)
    const { KiwiProvider } = await import('./kiwi.provider')
    const provider = new KiwiProvider()

    await expect(provider.getKiwi()).rejects.toBe(error)

    initialization.resolve(kiwi)
    await expect(provider.getKiwi()).resolves.toBe(kiwi)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('각 Provider 인스턴스가 Kiwi를 따로 초기화한다', async () => {
    const { build, create } = createBuilderStub()
    const firstKiwi = {}
    const secondKiwi = {}
    build.mockResolvedValueOnce(firstKiwi).mockResolvedValueOnce(secondKiwi)
    const { KiwiProvider } = await import('./kiwi.provider')
    const firstProvider = new KiwiProvider()
    const secondProvider = new KiwiProvider()

    await expect(firstProvider.getKiwi()).resolves.toBe(firstKiwi)
    await expect(secondProvider.getKiwi()).resolves.toBe(secondKiwi)
    expect(create).toHaveBeenCalledTimes(2)
  })
})
