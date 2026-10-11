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
    // Drizzle은 빈 get 결과를 undefined로 받아야 없는 행으로 처리한다.
    return args[2] === 'get' && result.rows.length === 0 ? { ...result, rows: undefined } : result
  }
  const batchDriver = async (queries: Parameters<SQLocalDrizzle['batchDriver']>[0]) => {
    const results = await sqlocal.batchDriver(queries)
    return results.map((result, index) => {
      if (queries[index].method !== 'get') return result
      // SQLocal batch는 get 결과도 행 배열의 배열로 반환한다.
      const [row] = result.rows
      return { ...result, rows: Array.isArray(row) ? row : undefined }
    })
  }

  // Drizzle 0.45.3은 런타임에서 없는 행을 처리하지만 콜백 타입은 rows의 undefined를 허용하지 않는다.
  return drizzle(driver as AsyncRemoteCallback, batchDriver as AsyncBatchRemoteCallback, {
    schema,
  })
}
