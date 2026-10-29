import { customType, integer } from 'drizzle-orm/sqlite-core'

// SQLite WASM의 BLOB은 Node Buffer가 아닌 Uint8Array로 주고받는다.
export const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => 'blob',
})

// Drizzle 쿼리에서 Unix epoch 밀리초로 기록한다. 직접 실행한 SQL에는 적용되지 않는다.
export const timestamps = {
  createdAt: integer()
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer()
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdate(() => Date.now()),
}
