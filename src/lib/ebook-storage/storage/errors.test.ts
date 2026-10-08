import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { getErrorCode } from './errors'

describe('저장소 오류 분류', () => {
  it.each([
    [5, 'locked'],
    [6, 'locked'],
    [13, 'quota'],
    [1, 'storage-failed'],
  ])('SQLite 오류 코드 %s를 유지한다', (resultCode, code) => {
    expect(
      getErrorCode(
        new DrizzleQueryError(
          'select 1',
          [],
          Object.assign(new Error('SQLite failure'), { resultCode }),
        ),
      ),
    ).toBe(code)
  })

  it.each([
    ['SQLITE_BUSY: database is locked', 'locked'],
    ['SQLITE_LOCKED: database table is locked', 'locked'],
    ['SQLITE_FULL: database or disk is full', 'quota'],
    ['sqlite3 result code 5: database is locked', 'locked'],
    ['UNIQUE constraint failed: books.content_hash', 'duplicate'],
    ['unexpected failure', 'storage-failed'],
  ])('Worker를 지나 속성이 사라진 오류도 분류한다: %s', (message, code) => {
    const transported = structuredClone(Object.assign(new Error(message), { resultCode: 5 }))
    expect(getErrorCode(new DrizzleQueryError('select 1', [], transported))).toBe(code)
  })
})
