import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageCapacity, isOpfsSupported, requestPersistentStorage } from './storage-manager'

function mockStorage(overrides: Partial<StorageManager> = {}) {
  const storage = {
    getDirectory: vi.fn(),
    persisted: vi.fn(async () => false),
    persist: vi.fn(async () => true),
    estimate: vi.fn(async () => ({ usage: 20, quota: 100 })),
    ...overrides,
  }
  vi.stubGlobal('navigator', { storage })
  return storage
}

afterEach(() => vi.unstubAllGlobals())

describe('storage-manager', () => {
  it('OPFS, Worker와 격리 컨텍스트가 모두 있어야 지원한다', () => {
    mockStorage()
    vi.stubGlobal('Worker', class {})
    vi.stubGlobal('crossOriginIsolated', true)
    expect(isOpfsSupported()).toBe(true)

    vi.stubGlobal('crossOriginIsolated', false)
    expect(isOpfsSupported()).toBe(false)
  })

  it('이미 영구 저장 중이면 다시 요청하지 않는다', async () => {
    const storage = mockStorage({ persisted: vi.fn(async () => true) })
    expect(await requestPersistentStorage()).toBe(true)
    expect(storage.persist).not.toHaveBeenCalled()
  })

  it('영구 저장 거부와 API 실패를 허용 실패로 처리한다', async () => {
    const persist = vi.fn(async () => false)
    mockStorage({ persist })
    expect(await requestPersistentStorage()).toBe(false)
    persist.mockRejectedValue(new Error('denied'))
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('예상 잔여량을 0 아래로 내리지 않고 추정 실패를 구분한다', async () => {
    const estimate = vi.fn(async () => ({ usage: 120, quota: 100 }))
    mockStorage({ estimate })
    expect(await getStorageCapacity()).toEqual({ usage: 120, quota: 100, remaining: 0 })
    estimate.mockRejectedValue(new Error('failed'))
    expect(await getStorageCapacity()).toBeNull()
  })
})
