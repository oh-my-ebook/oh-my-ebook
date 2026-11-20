import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './shared/lib/ebook-storage/schema/index.ts',
  out: './drizzle',
})
