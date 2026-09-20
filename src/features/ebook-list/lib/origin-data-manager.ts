function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`IndexedDB 삭제가 차단되었습니다: ${name}`))
    request.onsuccess = () => resolve()
  })
}

async function clearIndexedDatabases(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return
  const databases = await indexedDB.databases()

  await Promise.allSettled(
    databases.map(({ name }) => (name ? deleteDatabase(name) : Promise.resolve())),
  )
}

async function clearCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  const keys = await caches.keys()
  await Promise.allSettled(keys.map((name) => caches.delete(name)))
}

function clearCookies(): void {
  try {
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=', 1)[0]?.trim()
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
    }
  } catch (error) {
    console.warn('쿠키 정리 중 오류 발생:', error)
  }
}

export async function clearOriginData(): Promise<void> {
  try {
    localStorage.clear()
  } catch (error) {
    console.warn('localStorage 접근이 제한되었거나 오류가 발생했습니다:', error)
  }

  try {
    sessionStorage.clear()
  } catch (error) {
    console.warn('sessionStorage 접근이 제한되었거나 오류가 발생했습니다:', error)
  }

  clearCookies()

  await Promise.allSettled([
    clearCaches().catch((error) => console.warn('Cache Storage 정리 실패:', error)),
    clearIndexedDatabases().catch((error) => console.warn('IndexedDB 정리 실패:', error)),
  ])
}
