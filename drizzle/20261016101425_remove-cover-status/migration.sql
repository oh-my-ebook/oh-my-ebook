PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_books` (
	`id` text PRIMARY KEY,
	`content_hash` text NOT NULL UNIQUE,
	`file_name` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`pdf_title` text,
	`pdf_subject` text,
	`pdf_keywords` text,
	`publisher` text,
	`pdf_size` integer NOT NULL,
	`page_count` integer NOT NULL,
	`cover_data` blob,
	`cover_mime` text,
	`last_page` integer,
	`analysis_status` text NOT NULL,
	`ocr_completed_at` integer,
	`indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "books_pdf_size_check" CHECK("pdf_size" >= 0),
	CONSTRAINT "books_page_count_check" CHECK("page_count" > 0),
	CONSTRAINT "books_last_page_check" CHECK("last_page" IS NULL OR ("last_page" >= 1 AND "last_page" <= "page_count")),
	CONSTRAINT "books_analysis_status_check" CHECK("analysis_status" IN ('analyzing', 'ready', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_books`(`id`, `content_hash`, `file_name`, `title`, `author`, `pdf_title`, `pdf_subject`, `pdf_keywords`, `publisher`, `pdf_size`, `page_count`, `cover_data`, `cover_mime`, `last_page`, `analysis_status`, `ocr_completed_at`, `indexed_at`, `created_at`, `updated_at`) SELECT `id`, `content_hash`, `file_name`, `title`, `author`, `pdf_title`, `pdf_subject`, `pdf_keywords`, `publisher`, `pdf_size`, `page_count`, `cover_data`, `cover_mime`, `last_page`, `analysis_status`, `ocr_completed_at`, `indexed_at`, `created_at`, `updated_at` FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `books_created_at_idx` ON `books` ("created_at" DESC,"id" DESC);