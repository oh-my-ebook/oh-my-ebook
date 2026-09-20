import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearOriginData } from './origin-data-manager'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

describe('clearOriginData', () => {
  it('접근 가능한 origin 저장소를 모두 비운다', async () => {
    const cacheDelete = vi.fn(async () => true)
    const deleteDatabase = vi.fn(() => {
      const request = {} as IDBOpenDBRequest
      queueMicrotask(() => request.onsuccess?.(new Event('success')))
      return request
    })

    vi.stubGlobal('caches', { keys: vi.fn(async () => ['webllm']), delete: cacheDelete })
    vi.stubGlobal('indexedDB', {
      databases: vi.fn(async () => [{ name: 'app-data' }]),
      deleteDatabase,
    })
    localStorage.setItem('setting', 'value')
    sessionStorage.setItem('session', 'value')
    document.cookie = 'theme=dark; Path=/'

    await clearOriginData()

    expect(localStorage).toHaveLength(0)
    expect(sessionStorage).toHaveLength(0)
    expect(document.cookie).not.toContain('theme=dark')
    expect(cacheDelete).toHaveBeenCalledWith('webllm')
    expect(deleteDatabase).toHaveBeenCalledWith('app-data')
  })

  it('지원하지 않는 저장소 유형은 건너뛰고 사용 가능한 데이터를 지운다', async () => {
    vi.stubGlobal('navigator', { storage: {} })
    vi.stubGlobal('indexedDB', {})
    localStorage.setItem('setting', 'value')

    await expect(clearOriginData()).resolves.toBeUndefined()
    expect(localStorage).toHaveLength(0)
  })
})
