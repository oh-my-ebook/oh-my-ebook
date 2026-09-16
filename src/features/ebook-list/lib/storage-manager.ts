export interface StorageCapacity {
  usage: number
  quota: number
  remaining: number
}

export function isOpfsSupported(): boolean {
  return (
    globalThis.crossOriginIsolated === true &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
}

export async function getPersistentStorageStatus(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false

  try {
    return await navigator.storage.persisted()
  } catch {
    return false
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  const storage = navigator.storage
  if (!storage?.persisted || !storage.persist) return false

  try {
    return (await storage.persisted()) || (await storage.persist())
  } catch {
    return false
  }
}

export async function getStorageCapacity(): Promise<StorageCapacity | null> {
  if (!navigator.storage?.estimate) return null

  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (usage === undefined || quota === undefined) return null
    return { usage, quota, remaining: Math.max(0, quota - usage) }
  } catch {
    return null
  }
}
