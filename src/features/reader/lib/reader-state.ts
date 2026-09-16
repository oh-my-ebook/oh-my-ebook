interface PageSize {
  width: number
  height: number
}

export function calculatePageFitScale(
  pages: readonly PageSize[],
  availableWidth: number,
  availableHeight: number,
  pageGap = 0,
) {
  const pagesWidth = pages.reduce((width, page) => width + page.width, 0)
  const tallestPage = Math.max(...pages.map((page) => page.height))
  const totalGap = pageGap * Math.max(0, pages.length - 1)

  return Math.min((availableWidth - totalGap) / pagesWidth, availableHeight / tallestPage)
}
