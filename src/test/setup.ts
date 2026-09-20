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

  // jsdom은 Element.scrollTo도 구현하지 않는다. 자동 스크롤처럼 테스트 종료 후
  // requestAnimationFrame으로 늦게 실행되는 효과가 호출해도 예외가 나지 않게 no-op을 채운다.
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {}
  }

  // jsdom은 Element.scrollIntoView도 구현하지 않는다. 목차에서 현재 페이지로 스크롤을 따라가는
  // 효과처럼 이를 우연히 호출하는 테스트가 예외 없이 통과하도록 기본값을 채운다. 스크롤 동작
  // 자체를 검증하는 테스트는 이 기본값에 기대지 말고 vi.spyOn으로 직접 준비한다.
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {}
  }
})

// jsdom은 canvas 2D 컨텍스트를 구현하지 않아 호출마다 "Not implemented" 로그를 남기고 null을 반환한다.
// PDF 렌더링을 우연히 거치는 테스트의 로그만 없애려고 jsdom과 같은 null을 조용히 반환한다.
// canvas 사용 가능 여부가 결과에 영향을 주는 테스트는 이 기본값에 기대지 말고 vi.spyOn으로 직접 준비한다.
HTMLCanvasElement.prototype.getContext = () => null

afterEach(cleanup)
