import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    {
      name: 'social-urls',
      transformIndexHtml(html) {
        const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
        const origin = domain ? `https://${domain}` : 'http://localhost:5173'
        return html
          .replace('content="/"', `content="${origin}/"`)
          .replace(
            'content="/oh-my-book-thumbnail.png"',
            `content="${origin}/oh-my-book-thumbnail.png"`,
          )
      },
    },
  ],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
