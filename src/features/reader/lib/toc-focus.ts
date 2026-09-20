// TocPageThumbnail의 각 행 Button에 붙는 `data-page-number` 속성과 짝을 이룬다.
/** 목차 안에서 화살표로 페이지를 옮길 때, 새로 선택된 페이지의 썸네일로 실제 포커스도 옮긴다. */
export function focusTocPageThumbnail(container: Element, pageNumber: number) {
  container.querySelector<HTMLElement>(`[data-page-number="${pageNumber}"]`)?.focus()
}
