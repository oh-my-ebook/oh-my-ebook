import { asc, count, countDistinct, eq, inArray, notExists, sql } from 'drizzle-orm'
import type { TransactionHandle } from 'sqlocal'
import type { DatabaseConnection } from '../database-connection'
import type { ListOcrLinesInput, StoreSearchIndexInput } from '../types/inputs'
import type {
  ScoredSearchChunk,
  SearchChunkQuery,
  SearchChunkResult,
  SearchChunkSource,
} from '../types/search'
import type {
  ChunkSourcePage,
  SearchChunkInput,
  SearchChunkPage,
  SearchPostingPage,
  SearchTermPage,
} from '../types/search-index'
import {
  books,
  chunkSources,
  ocrPages,
  searchChunks as searchChunksTable,
  searchPostings,
  searchTerms,
} from '../schema'
import { NotFoundBookError } from '../storage-errors'
import { createSearchChunksSql } from './search-sql'

export async function refreshSearchTerms(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
): Promise<void> {
  await tx.query(
    db
      .delete(searchTerms)
      .where(
        notExists(
          db
            .select({ termId: searchPostings.termId })
            .from(searchPostings)
            .where(eq(searchPostings.termId, searchTerms.id)),
        ),
      ),
  )
  const postingCount = db
    .select({ total: count() })
    .from(searchPostings)
    .where(eq(searchPostings.termId, searchTerms.id))
  await tx.query(db.update(searchTerms).set({ documentFrequency: sql`(${postingCount})` }))
}

async function storeSearchChunk(
  db: DatabaseConnection['db'],
  tx: TransactionHandle,
  bookId: string,
  chunk: SearchChunkInput,
  createdAt: number,
): Promise<void> {
  await tx.query(
    db.insert(searchChunksTable).values({
      id: chunk.id,
      bookId,
      ordinal: chunk.ordinal,
      text: chunk.text,
      tokenCount: chunk.tokenCount,
      createdAt,
    }),
  )
  for (const source of chunk.sources) {
    const [sourcePage] = await tx.query(
      db
        .select({ bookId: ocrPages.bookId })
        .from(ocrPages)
        .where(eq(ocrPages.id, source.ocrPageId)),
    )
    if (sourcePage?.bookId !== bookId) {
      throw new Error('Chunk source does not belong to book')
    }
    await tx.query(
      db.insert(chunkSources).values({
        chunkId: chunk.id,
        ocrPageId: source.ocrPageId,
        startLineIndex: source.startLineIndex,
        endLineIndex: source.endLineIndex,
        sourceOrder: source.sourceOrder,
      }),
    )
  }
}

export function createSearchRepository(database: DatabaseConnection) {
  const { db, sqlocal } = database

  async function storeSearchIndex(input: StoreSearchIndexInput): Promise<void> {
    const book = await db.query.books.findFirst({
      columns: { id: true },
      where: eq(books.id, input.bookId),
    })
    if (!book) throw new NotFoundBookError()

    const now = Date.now()
    return await sqlocal.transaction(async (tx) => {
      await tx.query(db.delete(searchChunksTable).where(eq(searchChunksTable.bookId, input.bookId)))
      await refreshSearchTerms(db, tx)

      for (const chunk of input.chunks) {
        await storeSearchChunk(db, tx, input.bookId, chunk, now)
        for (const { term, termFrequency } of chunk.terms) {
          const [storedTerm] = await tx.query(
            db
              .insert(searchTerms)
              .values({ term, documentFrequency: 1 })
              .onConflictDoUpdate({
                target: searchTerms.term,
                set: { documentFrequency: sql`${searchTerms.documentFrequency} + 1` },
              })
              .returning({ id: searchTerms.id }),
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
            db.insert(searchPostings).values({ termId, chunkId: chunk.id, termFrequency }),
          )
        }
      }
      const [updated] = await tx.query(
        db
          .update(books)
          .set({ analysisStatus: 'ready', indexedAt: now, updatedAt: now })
          .where(eq(books.id, input.bookId))
          .returning({ id: books.id }),
      )
      if (!updated) throw new NotFoundBookError()
    })
  }

  async function listSearchChunks(input: ListOcrLinesInput): Promise<SearchChunkPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchChunksTable)
      .where(eq(searchChunksTable.bookId, input.bookId))
    if (!result) throw new Error('Invalid search chunk count')
    const rows = await db.query.searchChunks.findMany({
      columns: { bookId: false },
      where: eq(searchChunksTable.bookId, input.bookId),
      orderBy: [asc(searchChunksTable.ordinal)],
      limit: input.limit,
      offset: input.offset,
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
        chunkId: chunkSources.chunkId,
        pageNumber: ocrPages.pageNumber,
        startLineIndex: chunkSources.startLineIndex,
        endLineIndex: chunkSources.endLineIndex,
      })
      .from(chunkSources)
      .innerJoin(ocrPages, eq(ocrPages.id, chunkSources.ocrPageId))
      .where(
        inArray(
          chunkSources.chunkId,
          chunks.map(({ id }) => id),
        ),
      )
      .orderBy(asc(chunkSources.chunkId), asc(chunkSources.sourceOrder))

    const sourcesByChunkId = new Map<string, SearchChunkSource[]>()
    for (const { chunkId, ...source } of sourceRows) {
      const sources = sourcesByChunkId.get(chunkId) ?? []
      sources.push(source)
      sourcesByChunkId.set(chunkId, sources)
    }

    return chunks.map((chunk) => ({ ...chunk, sources: sourcesByChunkId.get(chunk.id) ?? [] }))
  }

  async function listSearchTerms(input: ListOcrLinesInput): Promise<SearchTermPage> {
    const [result] = await db
      .select({ total: countDistinct(searchTerms.id) })
      .from(searchTerms)
      .innerJoin(searchPostings, eq(searchPostings.termId, searchTerms.id))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
      .where(eq(searchChunksTable.bookId, input.bookId))
    if (!result) throw new Error('Invalid search term count')
    const rows = await db
      .select({
        id: searchTerms.id,
        term: searchTerms.term,
        documentFrequency: searchTerms.documentFrequency,
      })
      .from(searchTerms)
      .innerJoin(searchPostings, eq(searchPostings.termId, searchTerms.id))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
      .where(eq(searchChunksTable.bookId, input.bookId))
      .groupBy(searchTerms.id)
      .orderBy(asc(searchTerms.term))
      .limit(input.limit)
      .offset(input.offset)
    const terms = rows.map((row) => {
      const { id } = row
      if (id === null) throw new Error('Invalid search terms')
      return { ...row, id }
    })
    return { terms, total: result.total }
  }

  async function listSearchPostings(input: ListOcrLinesInput): Promise<SearchPostingPage> {
    const [result] = await db
      .select({ total: count() })
      .from(searchPostings)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
      .where(eq(searchChunksTable.bookId, input.bookId))
    if (!result) throw new Error('Invalid search posting count')
    const postings = await db
      .select({
        termId: searchPostings.termId,
        chunkId: searchPostings.chunkId,
        termFrequency: searchPostings.termFrequency,
        term: searchTerms.term,
        chunkOrdinal: searchChunksTable.ordinal,
      })
      .from(searchPostings)
      .innerJoin(searchTerms, eq(searchTerms.id, searchPostings.termId))
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, searchPostings.chunkId))
      .where(eq(searchChunksTable.bookId, input.bookId))
      .orderBy(asc(searchTerms.term), asc(searchChunksTable.ordinal))
      .limit(input.limit)
      .offset(input.offset)
    return { postings, total: result.total }
  }

  async function listChunkSources(input: ListOcrLinesInput): Promise<ChunkSourcePage> {
    const [result] = await db
      .select({ total: count() })
      .from(chunkSources)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSources.chunkId))
      .where(eq(searchChunksTable.bookId, input.bookId))
    if (!result) throw new Error('Invalid chunk source count')
    const rows = await db
      .select({
        id: chunkSources.id,
        chunkId: chunkSources.chunkId,
        chunkOrdinal: searchChunksTable.ordinal,
        ocrPageId: chunkSources.ocrPageId,
        pageNumber: ocrPages.pageNumber,
        startLineIndex: chunkSources.startLineIndex,
        endLineIndex: chunkSources.endLineIndex,
        sourceOrder: chunkSources.sourceOrder,
      })
      .from(chunkSources)
      .innerJoin(searchChunksTable, eq(searchChunksTable.id, chunkSources.chunkId))
      .innerJoin(ocrPages, eq(ocrPages.id, chunkSources.ocrPageId))
      .where(eq(searchChunksTable.bookId, input.bookId))
      .orderBy(asc(searchChunksTable.ordinal), asc(chunkSources.sourceOrder))
      .limit(input.limit)
      .offset(input.offset)
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
