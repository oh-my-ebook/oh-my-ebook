/// <reference lib="webworker" />

import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import type { EbookStoreErrorCode, EbookStoreResponse } from '../ebook-types'

const workerScope = self as DedicatedWorkerGlobalScope
let databasePromise: Promise<Database> | undefined

class UnsupportedStorageError extends Error {}

async function openDatabase(): Promise<Database> {
  const sqlite3 = await sqlite3InitModule()
  if (!sqlite3.capi.sqlite3_vfs_find('opfs')) throw new UnsupportedStorageError()

  const database = new sqlite3.oo1.OpfsDb('/ebook-library.sqlite3')
  try {
    const version = database.exec('PRAGMA user_version', {
      rowMode: 0,
      returnValue: 'resultRows',
    })[0]
    if (version === 0) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(`
          CREATE TABLE books (
            id TEXT PRIMARY KEY,
            content_hash TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            publisher TEXT,
            page_count INTEGER NOT NULL CHECK (page_count > 0),
            pdf_data BLOB NOT NULL,
            cover_data BLOB,
            cover_mime TEXT,
            cover_status TEXT NOT NULL CHECK (cover_status IN ('ready', 'fallback')),
            last_page INTEGER CHECK (
              last_page IS NULL OR (last_page >= 1 AND last_page <= page_count)
            ),
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX books_created_at_idx ON books(created_at DESC, id DESC);
          PRAGMA user_version = 1;
        `)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    } else if (version !== 1) {
      throw new Error('Unsupported schema version')
    }
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

function getDatabase(): Promise<Database> {
  databasePromise ??= openDatabase().catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

function getErrorCode(error: unknown): EbookStoreErrorCode {
  if (error instanceof UnsupportedStorageError) return 'unsupported'
  if (typeof error === 'object' && error !== null && 'resultCode' in error) {
    if (error.resultCode === 5 || error.resultCode === 6) return 'locked'
    if (error.resultCode === 13) return 'quota'
  }
  return 'storage-failed'
}

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  const request = event.data
  if (
    typeof request !== 'object' ||
    request === null ||
    !('requestId' in request) ||
    typeof request.requestId !== 'number' ||
    !('command' in request) ||
    typeof request.command !== 'string'
  ) {
    return
  }

  const { requestId, command } = request
  try {
    const database = await getDatabase()
    let result: unknown
    if (command === 'initialize') {
      result = null
    } else if (command === 'listBooks') {
      result = database.exec(
        `SELECT id, content_hash, file_name, title, author, publisher,
                page_count, cover_data, cover_mime, cover_status,
                last_page, created_at, updated_at
         FROM books ORDER BY created_at DESC, id DESC`,
        { rowMode: 'object', returnValue: 'resultRows' },
      )
    } else {
      throw new Error('Unsupported command')
    }
    workerScope.postMessage({ requestId, result } satisfies EbookStoreResponse)
  } catch (error) {
    workerScope.postMessage({
      requestId,
      error: { code: getErrorCode(error) },
    } satisfies EbookStoreResponse)
  }
}
