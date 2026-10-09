import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/ebook-storage/schema.ts',
  out: './drizzle',
})
