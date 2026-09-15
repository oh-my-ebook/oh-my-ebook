export function calculateSinglePageFitScale(
  pageWidth: number,
  pageHeight: number,
  availableWidth: number,
  availableHeight: number,
) {
  return Math.min(availableWidth / pageWidth, availableHeight / pageHeight)
}
