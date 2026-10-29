import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/ebook-storage/schema/index.ts',
  out: './drizzle',
})
