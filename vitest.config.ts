import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// .test.ts에도 Canvas와 DOM을 사용하는 테스트가 있으므로 jsdom 대상을 명시한다.
const domTests = [
  'src/**/*.test.tsx',
  'src/features/reader/hooks/*.test.ts',
  'src/features/reader/lib/{pdf-page-render,toc-focus}.test.ts',
  'src/features/bookshelf/lib/{pdf-import,pdf-import-cover,origin-data-manager}.test.ts',
  'src/lib/pdf/extract-text.test.ts',
  'src/lib/pdf/ocr/recognize-page.test.ts',
]

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            include: ['src/**/*.test.ts'], // .test.ts 파일 중에서
            exclude: domTests, // DOM이 필요한 파일을 제외하고
            environment: 'node', // 나머지를 DOM 없이 실행
            clearMocks: true,
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            include: domTests,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
            clearMocks: true,
          },
        },
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
      },
    },
  }),
)
