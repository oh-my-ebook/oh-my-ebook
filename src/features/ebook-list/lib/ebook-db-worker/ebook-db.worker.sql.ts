export const ENABLE_FOREIGN_KEYS_SQL = 'PRAGMA foreign_keys = ON'
export const GET_SCHEMA_VERSION_SQL = 'PRAGMA user_version'
export const BEGIN_TRANSACTION_SQL = 'BEGIN IMMEDIATE'
export const COMMIT_TRANSACTION_SQL = 'COMMIT'
export const ROLLBACK_TRANSACTION_SQL = 'ROLLBACK'

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

  PRAGMA user_version = 1;
`

export const SELECT_BOOK_ID_BY_CONTENT_HASH_SQL = 'SELECT id FROM books WHERE content_hash = ?'

export const INSERT_BOOK_SQL = `INSERT INTO books (
  id, content_hash, file_name, title, author, pdf_title, pdf_subject, pdf_keywords, publisher,
  pdf_size, page_count, cover_data, cover_mime, cover_status, last_page,
  analysis_status, ocr_completed_at, indexed_at, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`

export const DELETE_BOOK_BY_ID_SQL = 'DELETE FROM books WHERE id = ?'

export const SELECT_BOOKS_SQL = `SELECT id, content_hash, file_name, title,
  author, pdf_title, pdf_subject, pdf_keywords, publisher, pdf_size,
  page_count, cover_data, cover_mime, cover_status,
  last_page, analysis_status, ocr_completed_at, indexed_at, created_at, updated_at
  FROM books ORDER BY created_at DESC, id DESC`

export const SELECT_BOOK_EXISTS_SQL = 'SELECT 1 FROM books WHERE id = ?'

export const SELECT_BOOK_METADATA_SQL = `SELECT id, content_hash, file_name, title,
  author, pdf_title, pdf_subject, pdf_keywords, publisher, pdf_size,
  page_count, last_page
  FROM books WHERE id = ?`

export const UPDATE_BOOK_PROGRESS_SQL = `UPDATE books SET last_page = ?, updated_at = ?
  WHERE id = ? AND ? <= page_count`

export const UPDATE_BOOK_TITLE_SQL = 'UPDATE books SET title = ?, updated_at = ? WHERE id = ?'

export const UPDATE_BOOK_COVER_SQL = `UPDATE books
  SET cover_data = ?, cover_mime = ?, cover_status = 'ready', updated_at = ? WHERE id = ?`

export const RESET_INVALID_BOOK_PROGRESS_SQL =
  'UPDATE books SET last_page = 1, updated_at = ? WHERE id = ?'
export const SELECT_CHANGES_SQL = 'SELECT changes()'

export const SELECT_BOOK_PAGE_COUNT_SQL = 'SELECT page_count FROM books WHERE id = ?'
export const INSERT_OCR_PAGE_SQL = `INSERT OR IGNORE INTO ocr_pages (
  id, book_id, page_number, status, created_at, updated_at
) VALUES (?, ?, ?, 'pending', ?, ?)`
export const PREPARE_OCR_PAGES_FOR_RUN_SQL = `UPDATE ocr_pages
  SET status = 'pending', updated_at = ? WHERE book_id = ? AND status IN ('processing', 'failed')`
export const SELECT_NEXT_OCR_PAGE_SQL = `SELECT id, page_number FROM ocr_pages
  WHERE book_id = ? AND status = 'pending' ORDER BY page_number LIMIT 1`
export const SET_OCR_PAGE_PROCESSING_SQL = `UPDATE ocr_pages
  SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'`
export const DELETE_OCR_LINES_SQL = 'DELETE FROM ocr_lines WHERE ocr_page_id = ?'
export const INSERT_OCR_LINE_SQL = `INSERT INTO ocr_lines (
  ocr_page_id, line_index, raw_text, x0, y0, x1, y1
) VALUES (?, ?, ?, ?, ?, ?, ?)`
export const SET_OCR_PAGE_READY_SQL = `UPDATE ocr_pages
  SET width = ?, height = ?, status = 'ready', updated_at = ? WHERE id = ? AND status = 'processing'`
export const SELECT_OCR_PAGE_BOOK_ID_SQL = 'SELECT book_id FROM ocr_pages WHERE id = ?'
export const SET_OCR_PAGE_FAILED_SQL = `UPDATE ocr_pages
  SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'processing'`
export const SELECT_INCOMPLETE_OCR_PAGE_COUNT_SQL = `SELECT COUNT(*) FROM ocr_pages
  WHERE book_id = ? AND status != 'ready'`
export const SET_OCR_COMPLETED_AT_SQL = `UPDATE books
  SET ocr_completed_at = ?, updated_at = ? WHERE id = ? AND ocr_completed_at IS NULL`
export const SET_BOOK_ANALYSIS_FAILED_SQL = `UPDATE books
  SET analysis_status = 'failed', updated_at = ? WHERE id = ?`
export const SELECT_OCR_LINE_COUNT_SQL = `SELECT COUNT(*) FROM ocr_lines
  JOIN ocr_pages ON ocr_pages.id = ocr_lines.ocr_page_id WHERE ocr_pages.book_id = ?`
export const SELECT_OCR_LINES_SQL = `SELECT ocr_pages.page_number, ocr_lines.line_index,
  ocr_lines.raw_text, ocr_lines.x0, ocr_lines.y0, ocr_lines.x1, ocr_lines.y1
  FROM ocr_lines JOIN ocr_pages ON ocr_pages.id = ocr_lines.ocr_page_id
  WHERE ocr_pages.book_id = ? ORDER BY ocr_pages.page_number, ocr_lines.line_index LIMIT ? OFFSET ?`
export const SELECT_READY_OCR_PAGE_SQL = `SELECT id, width, height FROM ocr_pages
  WHERE book_id = ? AND page_number = ? AND status = 'ready'`
export const SELECT_OCR_PAGE_LINES_SQL = `SELECT raw_text, x0, y0, x1, y1 FROM ocr_lines
  WHERE ocr_page_id = ? ORDER BY line_index`
export const SELECT_OCR_PAGES_SQL = `SELECT page_number, status, width, height FROM ocr_pages
  WHERE book_id = ? ORDER BY page_number`
