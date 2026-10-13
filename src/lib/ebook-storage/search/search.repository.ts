import type { TransactionHandle } from 'sqlocal'
import type { DatabaseConnection } from '../database-connection'
import type { BookRecordsQuery } from '../types/book'
import type {
  SearchIndex,
  ChunkSourcePage,
  SearchChunkWithSources,
  SearchChunkPage,
  SearchPostingPage,
  SearchTermPage,
} from '../types/search-index'
import type {
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
import { NotFoundBookError } from '../storage-errors'
import { createSearchChunksSql } from './search-sql'

export async function refreshSearchTerms(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
): Promise<void> {
  await tx.query(
    db
      .delete(searchTermsTable)
      .where(
        notExists(
          db
            .select({ termId: searchPostingsTable.termId })
            .from(searchPostingsTable)
            .where(eq(searchPostingsTable.termId, searchTermsTable.id)),
        ),
      ),
  )
  const postingCount = db
    .select({ total: count() })
    .from(searchPostingsTable)
    .where(eq(searchPostingsTable.termId, searchTermsTable.id))
  await tx.query(db.update(searchTermsTable).set({ documentFrequency: sql`(${postingCount})` }))
}

async function storeSearchChunk(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
  bookId: string,
  chunk: SearchChunkWithSources,
  createdAt: number,
): Promise<void> {
  const { id, ordinal, text, tokenCount } = chunk
  const searchChunk = { id, bookId, ordinal, text, tokenCount, createdAt }
  await tx.query(db.insert(searchChunksTable).values(searchChunk))
  for (const source of chunk.sources) {
    const [sourcePage] = await tx.query(
      db
        .select({ bookId: ocrPagesTable.bookId })
        .from(ocrPagesTable)
        .where(eq(ocrPagesTable.id, source.ocrPageId)),
    )
    if (sourcePage?.bookId !== bookId) {
      throw new Error('Chunk source does not belong to book')
    }
    const chunkSource = { ...source, chunkId: chunk.id }
    await tx.query(db.insert(chunkSourcesTable).values(chunkSource))
  }
}

export function createSearchRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function storeSearchIndex(searchIndex: SearchIndex): Promise<void> {
    const book = await db.query.booksTable.findFirst({
      columns: { id: true },
      where: eq(booksTable.id, searchIndex.bookId),
    })
    if (!book) throw new NotFoundBookError()

    const now = Date.now()
    await sqlocal.transaction(async (tx) => {
      await tx.query(
        db.delete(searchChunksTable).where(eq(searchChunksTable.bookId, searchIndex.bookId)),
      )
      await refreshSearchTerms(db, tx)

      for (const chunk of searchIndex.chunks) {
        await storeSearchChunk(db, tx, searchIndex.bookId, chunk, now)
        for (const { term, termFrequency } of chunk.terms) {
          const [storedTerm] = await tx.query(
            db
              .insert(searchTermsTable)
              .values({ term, documentFrequency: 1 })
              .onConflictDoUpdate({
                target: searchTermsTable.term,
                set: { documentFrequency: sql`${searchTermsTable.documentFrequency} + 1` },
              })
              .returning({ id: searchTermsTable.id }),
          )
          const termId = storedTerm?.id
          if (
            termId === undefined ||
            termId === null ||
            !Number.isSafeInteger(termId) ||
            termId <= 0
          ) {
            throw new Error('Unable to store search term')
          }
          await tx.query(
            db.insert(searchPostingsTable).values({ termId, chunkId: chunk.id, termFrequency }),
          )
        }
      }
      const [updated] = await tx.query(
        db
          .update(booksTable)
          .set({ analysisStatus: 'ready', indexedAt: now, updatedAt: now })
          .where(eq(booksTable.id, searchIndex.bookId))
          .returning({ id: booksTable.id }),
      )
      if (!updated) throw new NotFoundBookError()
    })
  }

  async function listSearchChunks(searchChunkQuery: BookRecordsQuery): Promise<SearchChunkPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchChunksTable)
      .where(eq(searchChunksTable.bookId, searchChunkQuery.bookId))
    if (!result) throw new Error('Invalid search chunk count')
    const rows = await db.query.searchChunksTable.findMany({
      columns: { bookId: false },
      where: eq(searchChunksTable.bookId, searchChunkQuery.bookId),
      orderBy: [asc(searchChunksTable.ordinal)],
      limit: searchChunkQuery.limit,
      offset: searchChunkQuery.offset,
    })
    const chunks = rows.map((row) => {
      const { id } = row
      if (id === null) throw new Error('Invalid search chunks')
      return { ...row, id }
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
        pageNumber: ocrPagesTable.pageNumber,
        startLineIndex: chunkSourcesTable.startLineIndex,
        endLineIndex: chunkSourcesTable.endLineIndex,
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

    const sourcesByChunkId = new Map<string, SearchChunkSource[]>()
    for (const { chunkId, ...source } of sourceRows) {
      const sources = sourcesByChunkId.get(chunkId) ?? []
      sources.push(source)
      sourcesByChunkId.set(chunkId, sources)
    }

    const searchResults = chunks.map((chunk) => ({
      ...chunk,
      sources: sourcesByChunkId.get(chunk.id) ?? [],
    }))
    return searchResults
  }

  async function listSearchTerms(searchTermQuery: BookRecordsQuery): Promise<SearchTermPage> {
    const [result] = await db
      .select({ total: countDistinct(searchTermsTable.id) })
      .from(searchTermsTable)
      .innerJoin(searchPostingsTable, eq(searchPostingsTable.termId, searchTermsTable.id))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, searchTermQuery.bookId))
    if (!result) throw new Error('Invalid search term count')
    const terms = await db
      .select({
        id: searchPostingsTable.termId,
        term: searchTermsTable.term,
        documentFrequency: searchTermsTable.documentFrequency,
      })
      .from(searchTermsTable)
      .innerJoin(searchPostingsTable, eq(searchPostingsTable.termId, searchTermsTable.id))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, searchTermQuery.bookId))
      .groupBy(searchTermsTable.id)
      .orderBy(asc(searchTermsTable.term))
      .limit(searchTermQuery.limit)
      .offset(searchTermQuery.offset)
    return { terms, total: result.total }
  }

  async function listSearchPostings(
    searchPostingQuery: BookRecordsQuery,
  ): Promise<SearchPostingPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchPostingsTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, searchPostingQuery.bookId))
    if (!result) throw new Error('Invalid search posting count')
    const postings = await db
      .select({
        termId: searchPostingsTable.termId,
        chunkId: searchPostingsTable.chunkId,
        termFrequency: searchPostingsTable.termFrequency,
        term: searchTermsTable.term,
        chunkOrdinal: searchChunksTable.ordinal,
      })
      .from(searchPostingsTable)
      .innerJoin(searchTermsTable, eq(searchTermsTable.id, searchPostingsTable.termId))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostingsTable.chunkId))
      .where(eq(searchChunksTable.bookId, searchPostingQuery.bookId))
      .orderBy(asc(searchTermsTable.term), asc(searchChunksTable.ordinal))
      .limit(searchPostingQuery.limit)
      .offset(searchPostingQuery.offset)
    const postingPage: SearchPostingPage = { postings, total: result.total }
    return postingPage
  }

  async function listChunkSources(chunkSourceQuery: BookRecordsQuery): Promise<ChunkSourcePage> {
    const [result] = await db
      .select({ total: count() })
      .from(chunkSourcesTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSourcesTable.chunkId))
      .where(eq(searchChunksTable.bookId, chunkSourceQuery.bookId))
    if (!result) throw new Error('Invalid chunk source count')
    const rows = await db
      .select({
        id: chunkSourcesTable.id,
        chunkId: chunkSourcesTable.chunkId,
        chunkOrdinal: searchChunksTable.ordinal,
        ocrPageId: chunkSourcesTable.ocrPageId,
        pageNumber: ocrPagesTable.pageNumber,
        startLineIndex: chunkSourcesTable.startLineIndex,
        endLineIndex: chunkSourcesTable.endLineIndex,
        sourceOrder: chunkSourcesTable.sourceOrder,
      })
      .from(chunkSourcesTable)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSourcesTable.chunkId))
      .innerJoin(ocrPagesTable, eq(ocrPagesTable.id, chunkSourcesTable.ocrPageId))
      .where(eq(searchChunksTable.bookId, chunkSourceQuery.bookId))
      .orderBy(asc(searchChunksTable.ordinal), asc(chunkSourcesTable.sourceOrder))
      .limit(chunkSourceQuery.limit)
      .offset(chunkSourceQuery.offset)
    const sources = rows.map((row) => {
      const { id } = row
      if (id === null) throw new Error('Invalid chunk sources')
      return { ...row, id }
    })
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
