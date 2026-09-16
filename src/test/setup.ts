import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// jsdom은 matchMedia를 구현하지 않으므로, 각 테스트가 필요할 때 직접 stub하기 전까지
// 사용할 기본값을 제공해 관련 없는 테스트가 실패하지 않게 한다.
beforeEach(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
  }
})

afterEach(cleanup)
