import type { PdfPageInfo } from './pdf-document'

export type PageViewMode = 'single' | 'spread'
export type PageOrientation = 'landscape' | 'portrait'

export interface PageSpread {
  pages: readonly PdfPageInfo[]
  previousPage: number | null
  nextPage: number | null
}

export function getPageOrientation(page: PdfPageInfo): PageOrientation {
  return page.width > page.height ? 'landscape' : 'portrait'
}

export function isTwoPageViewAvailable(screenWidth: number, availableWidth: number) {
  return screenWidth >= 1024 && availableWidth >= 1000
}

function groupPages(pages: readonly PdfPageInfo[]) {
  const groups: PdfPageInfo[][] = []

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const nextPage = pages.at(index + 1)
    if (
      getPageOrientation(page) === 'portrait' &&
      nextPage &&
      getPageOrientation(nextPage) === 'portrait'
    ) {
      groups.push([page, nextPage])
      index += 1
    } else {
      groups.push([page])
    }
  }

  return groups
}

export function calculatePageSpread(
  pages: readonly PdfPageInfo[],
  currentPage: number,
  preferredView: PageViewMode,
  twoPageViewAvailable: boolean,
): PageSpread {
  const groups =
    preferredView === 'spread' && twoPageViewAvailable
      ? groupPages(pages)
      : pages.map((page) => [page])
  const currentGroupIndex = groups.findIndex((group) =>
    group.some(({ pageNumber }) => pageNumber === currentPage),
  )

  return {
    pages: groups[currentGroupIndex] ?? [],
    previousPage: groups[currentGroupIndex - 1]?.[0]?.pageNumber ?? null,
    nextPage: groups[currentGroupIndex + 1]?.[0]?.pageNumber ?? null,
  }
}
