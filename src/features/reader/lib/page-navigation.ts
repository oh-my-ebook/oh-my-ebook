export interface PageNavigation {
  firstPage: number | null
  previousPage: number | null
  nextPage: number | null
  lastPage: number | null
}

// 이전·다음 이동 대상은 두 페이지 보기 묶음을 고려해 호출자가 계산해 전달한다.
export function getPageNavigation(
  currentPage: number,
  totalPages: number,
  previousPage: number | null,
  nextPage: number | null,
): PageNavigation {
  return {
    firstPage: currentPage > 1 ? 1 : null,
    previousPage,
    nextPage,
    lastPage: currentPage < totalPages ? totalPages : null,
  }
}
