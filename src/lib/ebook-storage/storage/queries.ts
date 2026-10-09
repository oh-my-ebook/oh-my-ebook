export const ENABLE_FOREIGN_KEYS_SQL = 'PRAGMA foreign_keys = ON'
export const GET_SCHEMA_VERSION_SQL = 'PRAGMA user_version'

export const INITIAL_SCHEMA_SQL = `
  CREATE TABLE books (
    id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    pdf_title TEXT,
    pdf_subject TEXT,
    pdf_keywords TEXT,
    publisher TEXT,
    pdf_size INTEGER NOT NULL CHECK (pdf_size >= 0),
    page_count INTEGER NOT NULL CHECK (page_count > 0),
    cover_data BLOB,
    cover_mime TEXT,
    cover_status TEXT NOT NULL CHECK (cover_status IN ('ready', 'fallback')),
    last_page INTEGER CHECK (last_page IS NULL OR (last_page >= 1 AND last_page <= page_count)),
    analysis_status TEXT NOT NULL CHECK (analysis_status IN ('analyzing', 'ready', 'failed')),
    ocr_completed_at INTEGER,
    indexed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX books_created_at_idx ON books(created_at DESC, id DESC);

  CREATE TABLE ocr_pages (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL CHECK (page_number > 0),
    width INTEGER CHECK (width IS NULL OR width > 0),
    height INTEGER CHECK (height IS NULL OR height > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX ocr_pages_book_page_idx ON ocr_pages(book_id, page_number);
  CREATE INDEX ocr_pages_resume_idx ON ocr_pages(book_id, status, page_number);

  CREATE TABLE ocr_lines (
    id INTEGER PRIMARY KEY,
    ocr_page_id TEXT NOT NULL REFERENCES ocr_pages(id) ON DELETE CASCADE,
    line_index INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    x0 REAL NOT NULL,
    y0 REAL NOT NULL,
    x1 REAL NOT NULL CHECK (x1 > x0),
    y1 REAL NOT NULL CHECK (y1 > y0)
  );
  CREATE UNIQUE INDEX ocr_lines_page_order_idx ON ocr_lines(ocr_page_id, line_index);

  CREATE TABLE search_chunks (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,
    text TEXT NOT NULL,
    token_count INTEGER NOT NULL CHECK (token_count > 0),
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX search_chunks_book_order_idx ON search_chunks(book_id, ordinal);

  CREATE TABLE chunk_sources (
    id INTEGER PRIMARY KEY,
    chunk_id TEXT NOT NULL REFERENCES search_chunks(id) ON DELETE CASCADE,
    ocr_page_id TEXT NOT NULL REFERENCES ocr_pages(id) ON DELETE CASCADE,
    start_line_index INTEGER NOT NULL,
    end_line_index INTEGER NOT NULL CHECK (end_line_index >= start_line_index),
    source_order INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX chunk_sources_chunk_order_idx ON chunk_sources(chunk_id, source_order);
  CREATE INDEX chunk_sources_page_line_idx ON chunk_sources(ocr_page_id, start_line_index);

  CREATE TABLE search_terms (
    id INTEGER PRIMARY KEY,
    term TEXT NOT NULL UNIQUE,
    document_frequency INTEGER NOT NULL CHECK (document_frequency > 0)
  );

  CREATE TABLE search_postings (
    term_id INTEGER NOT NULL REFERENCES search_terms(id),
    chunk_id TEXT NOT NULL REFERENCES search_chunks(id) ON DELETE CASCADE,
    term_frequency INTEGER NOT NULL CHECK (term_frequency > 0),
    PRIMARY KEY (term_id, chunk_id)
  );
  CREATE INDEX search_postings_chunk_idx ON search_postings(chunk_id);

  PRAGMA user_version = 1;
`

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
