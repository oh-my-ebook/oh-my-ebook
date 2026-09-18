export function isOpfsSupported(): boolean {
  return (
    globalThis.crossOriginIsolated === true &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
}

export async function getStorageUsage(): Promise<number | null> {
  if (!navigator.storage?.estimate) return null

  try {
    const { usage } = await navigator.storage.estimate()
    return usage ?? null
  } catch {
    return null
  }
}
