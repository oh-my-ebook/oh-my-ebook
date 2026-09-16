export function getSinglePageNavigation(currentPage: number, totalPages: number) {
  return {
    pageNumbers: [currentPage],
    firstPage: currentPage > 1 ? 1 : null,
    previousPage: currentPage > 1 ? currentPage - 1 : null,
    nextPage: currentPage < totalPages ? currentPage + 1 : null,
    lastPage: currentPage < totalPages ? totalPages : null,
  }
}
