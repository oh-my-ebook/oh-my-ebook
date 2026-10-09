export const DEFAULT_BM25_K1 = 1.2
export const DEFAULT_BM25_B = 0.75

export function createSearchChunksSql(termCount: number): string {
  if (!Number.isSafeInteger(termCount) || termCount <= 0) {
    throw new RangeError('검색어 수는 양의 정수여야 합니다.')
  }

  const queryTermValues = Array.from({ length: termCount }, () => '(?)').join(', ')
  return `WITH
  query_terms(term) AS (VALUES ${queryTermValues}),
  book_chunks AS (
    SELECT id, ordinal, text, token_count FROM search_chunks WHERE book_id = ?
  ),
  corpus AS (
    SELECT COUNT(*) AS document_count, AVG(token_count) AS average_document_length
    FROM book_chunks
  ),
  term_document_frequencies AS (
    SELECT search_postings.term_id, COUNT(*) AS document_frequency
    FROM search_postings
    JOIN book_chunks ON book_chunks.id = search_postings.chunk_id
    JOIN search_terms ON search_terms.id = search_postings.term_id
    JOIN query_terms ON query_terms.term = search_terms.term
    GROUP BY search_postings.term_id
  )
  SELECT book_chunks.id, book_chunks.ordinal, book_chunks.text, book_chunks.token_count,
    SUM(
      ln(
        (corpus.document_count - term_document_frequencies.document_frequency + 0.5) /
        (term_document_frequencies.document_frequency + 0.5) + 1
      ) * (
        search_postings.term_frequency * (${DEFAULT_BM25_K1} + 1) /
        (
          search_postings.term_frequency + ${DEFAULT_BM25_K1} *
          (1 - ${DEFAULT_BM25_B} + ${DEFAULT_BM25_B} *
            book_chunks.token_count / corpus.average_document_length)
        )
      )
    ) AS score
  FROM search_postings
  JOIN book_chunks ON book_chunks.id = search_postings.chunk_id
  JOIN search_terms ON search_terms.id = search_postings.term_id
  JOIN query_terms ON query_terms.term = search_terms.term
  JOIN term_document_frequencies
    ON term_document_frequencies.term_id = search_postings.term_id
  CROSS JOIN corpus
  GROUP BY book_chunks.id, book_chunks.ordinal, book_chunks.text, book_chunks.token_count
  ORDER BY score DESC, ordinal ASC
  LIMIT ?`
}
