import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageUsage, isOpfsSupported } from './storage-manager'

function mockStorage(overrides: Partial<StorageManager> = {}) {
  const storage = {
    getDirectory: vi.fn(),
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

  it('usage만 조회하고 usage가 없거나 추정에 실패하면 null을 반환한다', async () => {
    const estimate = vi.fn(async (): Promise<StorageEstimate> => ({ usage: 120 }))
    mockStorage({ estimate })
    expect(await getStorageUsage()).toBe(120)
    expect(estimate).toHaveBeenCalledOnce()

    estimate.mockResolvedValue({})
    expect(await getStorageUsage()).toBeNull()
    estimate.mockRejectedValue(new Error('failed'))
    expect(await getStorageUsage()).toBeNull()
  })
})
