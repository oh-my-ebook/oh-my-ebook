export interface PageNavigation {
  firstPage: number | null
  previousPage: number | null
  nextPage: number | null
  lastPage: number | null
}

// 이전·다음 이동 대상은 두 페이지 보기 묶음을 고려해 호출자가 계산해 전달한다.
// 첫·마지막 이동도 같은 묶음 경계를 따르도록 previousPage·nextPage의 존재 여부로 판단한다.
export function getPageNavigation(
  totalPages: number,
  previousPage: number | null,
  nextPage: number | null,
): PageNavigation {
  return {
    firstPage: previousPage === null ? null : 1,
    previousPage,
    nextPage,
    lastPage: nextPage === null ? null : totalPages,
  }
}
