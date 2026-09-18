import { useCallback, useState } from 'react'
import {
  getPersistentStorageStatus,
  getStorageCapacity,
  requestPersistentStorage,
  type StorageCapacity,
} from '../lib/storage-manager'

export function useLibraryStorage() {
  const [capacity, setCapacity] = useState<StorageCapacity | null>(null)
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(null)

  const refreshCapacity = useCallback(async () => {
    setCapacity(await getStorageCapacity())
  }, [])

  const refreshStorageStatus = useCallback(async () => {
    const [nextCapacity, isPersistent] = await Promise.all([
      getStorageCapacity(),
      getPersistentStorageStatus(),
    ])
    setCapacity(nextCapacity)
    setPersistentStorage(isPersistent)
  }, [])

  const requestPersistence = useCallback(async (): Promise<boolean> => {
    const isPersistent = await requestPersistentStorage()
    setPersistentStorage(isPersistent)
    return isPersistent
  }, [])

  return { capacity, persistentStorage, refreshCapacity, refreshStorageStatus, requestPersistence }
}
