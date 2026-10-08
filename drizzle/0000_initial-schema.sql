CREATE TABLE `books` (
	`id` text PRIMARY KEY,
	`content_hash` text NOT NULL,
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
	`cover_status` text NOT NULL,
	`last_page` integer,
	`analysis_status` text NOT NULL,
	`ocr_completed_at` integer,
	`indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "books_pdf_size_check" CHECK("books"."pdf_size" >= 0),
	CONSTRAINT "books_page_count_check" CHECK("books"."page_count" > 0),
	CONSTRAINT "books_cover_status_check" CHECK("books"."cover_status" IN ('ready', 'fallback')),
	CONSTRAINT "books_last_page_check" CHECK("books"."last_page" IS NULL OR ("books"."last_page" >= 1 AND "books"."last_page" <= "books"."page_count")),
	CONSTRAINT "books_analysis_status_check" CHECK("books"."analysis_status" IN ('analyzing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_content_hash_unique` ON `books` (`content_hash`);--> statement-breakpoint
CREATE INDEX `books_created_at_idx` ON `books` ("created_at" DESC,"id" DESC);--> statement-breakpoint
CREATE TABLE `chunk_sources` (
	`id` integer PRIMARY KEY,
	`chunk_id` text NOT NULL,
	`ocr_page_id` text NOT NULL,
	`start_line_index` integer NOT NULL,
	`end_line_index` integer NOT NULL,
	`source_order` integer NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `search_chunks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ocr_page_id`) REFERENCES `ocr_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chunk_sources_line_range_check" CHECK("chunk_sources"."end_line_index" >= "chunk_sources"."start_line_index")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chunk_sources_chunk_order_idx` ON `chunk_sources` (`chunk_id`,`source_order`);--> statement-breakpoint
CREATE INDEX `chunk_sources_page_line_idx` ON `chunk_sources` (`ocr_page_id`,`start_line_index`);--> statement-breakpoint
CREATE TABLE `ocr_lines` (
	`id` integer PRIMARY KEY,
	`ocr_page_id` text NOT NULL,
	`line_index` integer NOT NULL,
	`raw_text` text NOT NULL,
	`x0` real NOT NULL,
	`y0` real NOT NULL,
	`x1` real NOT NULL,
	`y1` real NOT NULL,
	FOREIGN KEY (`ocr_page_id`) REFERENCES `ocr_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ocr_lines_x1_check" CHECK("ocr_lines"."x1" > "ocr_lines"."x0"),
	CONSTRAINT "ocr_lines_y1_check" CHECK("ocr_lines"."y1" > "ocr_lines"."y0")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ocr_lines_page_order_idx` ON `ocr_lines` (`ocr_page_id`,`line_index`);--> statement-breakpoint
CREATE TABLE `ocr_pages` (
	`id` text PRIMARY KEY,
	`book_id` text NOT NULL,
	`page_number` integer NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ocr_pages_page_number_check" CHECK("ocr_pages"."page_number" > 0),
	CONSTRAINT "ocr_pages_width_check" CHECK("ocr_pages"."width" IS NULL OR "ocr_pages"."width" > 0),
	CONSTRAINT "ocr_pages_height_check" CHECK("ocr_pages"."height" IS NULL OR "ocr_pages"."height" > 0),
	CONSTRAINT "ocr_pages_status_check" CHECK("ocr_pages"."status" IN ('pending', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ocr_pages_book_page_idx` ON `ocr_pages` (`book_id`,`page_number`);--> statement-breakpoint
CREATE INDEX `ocr_pages_resume_idx` ON `ocr_pages` (`book_id`,`status`,`page_number`);--> statement-breakpoint
CREATE TABLE `search_chunks` (
	`id` text PRIMARY KEY,
	`book_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`token_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_chunks_token_count_check" CHECK("search_chunks"."token_count" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_chunks_book_order_idx` ON `search_chunks` (`book_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `search_postings` (
	`term_id` integer NOT NULL,
	`chunk_id` text NOT NULL,
	`term_frequency` integer NOT NULL,
	PRIMARY KEY(`term_id`, `chunk_id`),
	FOREIGN KEY (`term_id`) REFERENCES `search_terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chunk_id`) REFERENCES `search_chunks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "search_postings_term_frequency_check" CHECK("search_postings"."term_frequency" > 0)
);
--> statement-breakpoint
CREATE INDEX `search_postings_chunk_idx` ON `search_postings` (`chunk_id`);--> statement-breakpoint
CREATE TABLE `search_terms` (
	`id` integer PRIMARY KEY,
	`term` text NOT NULL,
	`document_frequency` integer NOT NULL,
	CONSTRAINT "search_terms_document_frequency_check" CHECK("search_terms"."document_frequency" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_terms_term_unique` ON `search_terms` (`term`);