import {
  drizzle,
  type AsyncRemoteCallback,
  type AsyncBatchRemoteCallback,
} from 'drizzle-orm/sqlite-proxy'
import type { SQLocalDrizzle } from 'sqlocal/drizzle'
import * as schema from './schema'

export function createDrizzleDatabase(sqlocal: SQLocalDrizzle) {
  const driver = async (...args: Parameters<SQLocalDrizzle['driver']>) => {
    const result = await sqlocal.driver(...args)
    const isGetMethod = args[2] === 'get'
    const emptyRow = result.rows.length === 0
    // Drizzle은 빈 get 결과를 undefined로 받아야 없는 행으로 처리한다.
    const normalizedResult = isGetMethod && emptyRow ? { ...result, rows: undefined } : result
    return normalizedResult
  }
  const batchDriver = async (queries: Parameters<SQLocalDrizzle['batchDriver']>[0]) => {
    const results = await sqlocal.batchDriver(queries)
    const normalizedResults = results.map((result, index) => {
      const isGetMethod = queries[index].method === 'get'
      if (!isGetMethod) return result

      // SQLocal batch는 get 결과도 행 배열의 배열로 반환한다.
      const [row] = result.rows
      return { ...result, rows: Array.isArray(row) ? row : undefined }
    })
    return normalizedResults
  }

  // Drizzle 0.45.3은 런타임에서 없는 행을 처리하지만 콜백 타입은 rows의 undefined를 허용하지 않는다.
  const database = drizzle(driver as AsyncRemoteCallback, batchDriver as AsyncBatchRemoteCallback, {
    schema,
  })
  return database
}
