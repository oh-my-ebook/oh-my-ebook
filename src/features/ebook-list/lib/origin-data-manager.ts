function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function clearIndexedDatabases(): Promise<void> {
  if (typeof indexedDB.databases !== 'function') return
  const databases = await indexedDB.databases()
  await Promise.all(databases.flatMap(({ name }) => (name ? [deleteDatabase(name)] : [])))
}

async function clearCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  await Promise.all((await caches.keys()).map((name) => caches.delete(name)))
}

function clearCookies(): void {
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=', 1)[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
  }
}

export async function clearOriginData(): Promise<void> {
  localStorage.clear()
  sessionStorage.clear()
  clearCookies()
  await Promise.all([clearCaches(), clearIndexedDatabases()])
}
