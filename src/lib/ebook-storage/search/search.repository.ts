import type { TransactionHandle } from 'sqlocal'
import type { DatabaseConnection } from '../database-connection'
import type {
  SearchIndex,
  ChunkSourcePage,
  SearchChunkWithSources,
  SearchChunkPage,
  SearchPostingPage,
  SearchTermPage,
  ScoredSearchChunk,
  SearchChunkQuery,
  SearchChunkResult,
  SearchChunkSource,
} from '../types/search'
import { asc, count, countDistinct, eq, inArray, notExists, sql } from 'drizzle-orm'
import {
  booksTable,
  chunkSourcesTable,
  ocrPagesTable,
  searchChunksTable,
  searchPostingsTable,
  searchTermsTable,
} from '../schema'
import {
  chunkSourceRecordColumns,
  searchChunkSourceColumns,
  searchPostingRecordColumns,
} from '../schema/search'
import { NotFoundBookError } from '../storage-errors'
import { createSearchChunksSql } from './search-sql'

/**
 * 어느 청크에서도 사용하지 않는 검색어를 삭제한다.
 * 책·청크 삭제 시 CASCADE는 검색어 연결만 지우므로 공유 검색어는 별도 정리가 필요하다.
 *
 * @param tx 책 또는 청크를 삭제한 트랜잭션. 정리에 실패하면 삭제도 함께 롤백한다.
 */
export async function deleteUnusedSearchTerms(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
): Promise<void> {
  const termPostingsQuery = db
    .select({ termId: searchPostingsTable.termId })
    .from(searchPostingsTable)
    .where(eq(searchPostingsTable.termId, searchTermsTable.id))
  const deleteTermsQuery = db.delete(searchTermsTable).where(notExists(termPostingsQuery))
  await tx.query(deleteTermsQuery)
}

/**
 * 남아 있는 모든 검색어의 documentFrequency를 전체 책의 청크 수를 기준으로 다시 계산한다.
 * 각 검색어를 포함한 청크 수이며, 청크 안의 등장 횟수인 termFrequency는 변경하지 않는다.
 * documentFrequency > 0 제약을 지키도록 같은 트랜잭션에서 deleteUnusedSearchTerms를 먼저 실행한다.
 *
 * @param tx 책 또는 청크를 삭제한 트랜잭션. 재계산에 실패하면 삭제도 함께 롤백한다.
 */
export async function recalculateTermFrequencies(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
): Promise<void> {
  const postingCountQuery = db
    .select({ total: count() })
    .from(searchPostingsTable)
    .where(eq(searchPostingsTable.termId, searchTermsTable.id))
  const updateFrequenciesQuery = db
    .update(searchTermsTable)
    .set({ documentFrequency: sql`(${postingCountQuery})` })
  await tx.query(updateFrequenciesQuery)
}

async function storeSearchChunk(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
  bookId: string,
  chunk: SearchChunkWithSources,
): Promise<void> {
  const { id, ordinal, text, tokenCount } = chunk
  const searchChunk = { id, bookId, ordinal, text, tokenCount }
  const insertChunkQuery = db.insert(searchChunksTable).values(searchChunk)
  await tx.query(insertChunkQuery)
  for (const source of chunk.sources) {
    const sourceBookQuery = db
      .select({ bookId: ocrPagesTable.bookId })
      .from(ocrPagesTable)
      .where(eq(ocrPagesTable.id, source.ocrPageId))
      .limit(1)
    const [sourceBook] = await tx.query(sourceBookQuery)
    if (sourceBook?.bookId !== bookId) {
      throw new Error('Chunk source does not belong to book')
    }
    const chunkSource = { ...source, chunkId: chunk.id }
    const insertSourceQuery = db.insert(chunkSourcesTable).values(chunkSource)
    await tx.query(insertSourceQuery)
  }
}

export function createSearchRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function storeSearchIndex(searchIndex: SearchIndex): Promise<void> {
    const book = await db.query.booksTable.findFirst({
      columns: { id: true },
      where: { id: searchIndex.bookId },
    })
    if (!book) throw new NotFoundBookError()

    const now = Date.now()
    await sqlocal.transaction(async (tx) => {
      const deleteChunksQuery = db
        .delete(searchChunksTable)
        .where(eq(searchChunksTable.bookId, searchIndex.bookId))
      await tx.query(deleteChunksQuery)
      await deleteUnusedSearchTerms(db, tx)
      await recalculateTermFrequencies(db, tx)

      for (const chunk of searchIndex.chunks) {
        await storeSearchChunk(db, tx, searchIndex.bookId, chunk)
        for (const { term, termFrequency } of chunk.terms) {
          const upsertTermQuery = db
            .insert(searchTermsTable)
            .values({ term, documentFrequency: 1 })
            .onConflictDoUpdate({
              target: searchTermsTable.term,
              set: { documentFrequency: sql`${searchTermsTable.documentFrequency} + 1` },
            })
            .returning({ id: searchTermsTable.id })
          const [storedTerm] = await tx.query(upsertTermQuery)
          const termId = storedTerm?.id
          if (termId === undefined || !Number.isSafeInteger(termId) || termId <= 0) {
            throw new Error('Unable to store search term')
          }
          const insertPostingQuery = db
            .insert(searchPostingsTable)
            .values({ termId, chunkId: chunk.id, termFrequency })
          await tx.query(insertPostingQuery)
        }
      }
      const completeIndexQuery = db
        .update(booksTable)
        .set({ analysisStatus: 'ready', indexedAt: now })
        .where(eq(booksTable.id, searchIndex.bookId))
        .returning({ id: booksTable.id })
      const [indexedBook] = await tx.query(completeIndexQuery)
      if (!indexedBook) throw new NotFoundBookError()
    })
  }

  async function listSearchChunks({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchChunkPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchChunksTable)
      .where(eq(searchChunksTable.bookId, bookId))
    if (!result) throw new Error('Invalid search chunk count')
    const chunks = await db.query.searchChunksTable.findMany({
      columns: { bookId: false },
      where: { bookId },
      orderBy: { ordinal: 'asc' },
      limit: limit,
      offset: offset,
    })
    return { chunks, total: result.total }
  }

  function isSearchChunkResultRow(value: unknown): value is ScoredSearchChunk {
    if (typeof value !== 'object' || value === null) return false
    return (
      'id' in value &&
      typeof value.id === 'string' &&
      'ordinal' in value &&
      typeof value.ordinal === 'number' &&
      'text' in value &&
      typeof value.text === 'string' &&
      'tokenCount' in value &&
      typeof value.tokenCount === 'number' &&
      'score' in value &&
      typeof value.score === 'number' &&
      Number.isFinite(value.score)
    )
  }

  async function searchChunks(query: SearchChunkQuery): Promise<SearchChunkResult[]> {
    if (query.terms.length === 0) return []

    const rows = await sqlocal.sql<Record<string, unknown>>(
      createSearchChunksSql(query.terms.length),
      ...query.terms,
      query.bookId,
      query.limit,
    )

    const chunks: ScoredSearchChunk[] = []
    for (const row of rows) {
      if (!isSearchChunkResultRow(row)) throw new Error('Invalid search chunks')
      chunks.push(row)
    }
    if (chunks.length === 0) return []

    const sourceRows = await db
      .select({
        chunkId: chunkSourcesTable.chunkId,
        ...searchChunkSourceColumns,
      })
      .from(chunkSourcesTable)
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, chunkSourcesTable.ocrPageId))
      .where(
        inArray(
          chunkSourcesTable.chunkId,
          chunks.map(({ id }) => id),
        ),
      )
      .orderBy(asc(chunkSourcesTable.chunkId), asc(chunkSourcesTable.sourceOrder))

    const chunkSources = new Map<string, SearchChunkSource[]>()
    for (const { chunkId, ...source } of sourceRows) {
      const sources = chunkSources.get(chunkId) ?? []
      sources.push(source)
      chunkSources.set(chunkId, sources)
    }

    const searchResults = chunks.map((chunk) => ({
      ...chunk,
      sources: chunkSources.get(chunk.id) ?? [],
    }))
    return searchResults
  }

  async function listSearchTerms({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchTermPage> {
    const [result] = await db
      .select({ total: countDistinct(searchTermsTable.id) })
      .from(searchTermsTable)
      .innerJoin(searchPostingsTable, eq(searchPostingsTable.termId, searchTermsTable.id))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, bookId))
    if (!result) throw new Error('Invalid search term count')
    const terms = await db.query.searchTermsTable.findMany({
      where: {
        postings: {
          chunk: { bookId },
        },
      },
      orderBy: { term: 'asc' },
      limit,
      offset,
    })
    return { terms, total: result.total }
  }

  async function listSearchPostings({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<SearchPostingPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchPostingsTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, bookId))
    if (!result) throw new Error('Invalid search posting count')
    const postings = await db
      .select(searchPostingRecordColumns)
      .from(searchPostingsTable)
      .innerJoin(searchTermsTable, eq(searchTermsTable.id, searchPostingsTable.termId))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, bookId))
      .orderBy(asc(searchTermsTable.term), asc(searchChunksTable.ordinal))
      .limit(limit)
      .offset(offset)
    const postingPage: SearchPostingPage = { postings, total: result.total }
    return postingPage
  }

  async function listChunkSources({
    bookId,
    limit,
    offset,
  }: {
    bookId: string
    limit: number
    offset: number
  }): Promise<ChunkSourcePage> {
    const [result] = await db
      .select({ total: count() })
      .from(chunkSourcesTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSourcesTable.chunkId))
      .where(eq(searchChunksTable.bookId, bookId))
    if (!result) throw new Error('Invalid chunk source count')
    const sources = await db
      .select(chunkSourceRecordColumns)
      .from(chunkSourcesTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSourcesTable.chunkId))
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, chunkSourcesTable.ocrPageId))
      .where(eq(searchChunksTable.bookId, bookId))
      .orderBy(asc(searchChunksTable.ordinal), asc(chunkSourcesTable.sourceOrder))
      .limit(limit)
      .offset(offset)
    return { sources, total: result.total }
  }

  return {
    storeSearchIndex,
    listSearchChunks,
    searchChunks,
    listSearchTerms,
    listSearchPostings,
    listChunkSources,
  }
}
