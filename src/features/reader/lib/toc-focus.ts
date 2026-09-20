// TocPageThumbnail의 각 행 Button에 붙는 `data-page-number` 속성과 짝을 이룬다.
/**
 * 목차 안에서 화살표로 페이지를 옮길 때, 새로 선택된 페이지의 썸네일로 실제 포커스도 옮긴다.
 *
 * 포커스를 옮기면 브라우저가 기본적으로 그 요소를 화면에 보이도록 자체적으로 스크롤하는데,
 * 이 스크롤은 TocPageThumbnail이 `scrollIntoView`로 직접 담당하는 스크롤과 서로 다른 시점에
 * 겹쳐 일어나 스크롤 위치가 엉뚱하게 튀는 원인이 된다. `preventScroll`로 브라우저 기본 스크롤을
 * 막아, 스크롤은 항상 TocPageThumbnail의 효과 하나만 담당하게 한다.
 */
export function focusTocPageThumbnail(container: Element, pageNumber: number) {
  container.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`)?.focus({
    preventScroll: true,
  })
}
