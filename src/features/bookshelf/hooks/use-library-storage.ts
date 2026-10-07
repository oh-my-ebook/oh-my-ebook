import { useCallback, useState } from 'react'
import { getStorageUsage } from '../lib/storage-manager'

export function useLibraryStorage() {
  const [usage, setUsage] = useState<number | null>(null)

  const refreshUsage = useCallback(async () => {
    setUsage(await getStorageUsage())
  }, [])

  return { usage, refreshUsage }
}
