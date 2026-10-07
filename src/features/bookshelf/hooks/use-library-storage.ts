import { useCallback, useState } from 'react'
import { getStorageUsage } from '@/lib/ebook/storage/browser-storage'

export function useLibraryStorage() {
  const [usage, setUsage] = useState<number | null>(null)

  const refreshUsage = useCallback(async () => {
    setUsage(await getStorageUsage())
  }, [])

  return { usage, refreshUsage }
}
