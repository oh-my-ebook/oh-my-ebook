const MIN_MANUAL_SCALE = 0.25
const MAX_MANUAL_SCALE = 3
const MANUAL_SCALE_STEP = 0.25

interface Size {
  width: number
  height: number
}

interface FitHeightZoom {
  mode: 'fit-height'
}

interface ManualZoom {
  mode: 'manual'
  scale: number
}

export type ReaderZoom = FitHeightZoom | ManualZoom

export const FIT_HEIGHT_ZOOM: ReaderZoom = { mode: 'fit-height' }

export function calculateFitHeightScale(
  pages: readonly [Size, ...Size[]],
  availableSize: Size,
  pageGap = 0,
) {
  const pagesWidth = pages.reduce((width, page) => width + page.width, 0)
  const tallestPage = Math.max(...pages.map((page) => page.height))
  const totalGap = pageGap * (pages.length - 1)
  const widthScale = Math.max(availableSize.width - totalGap, 0) / pagesWidth

  return Math.min(widthScale, availableSize.height / tallestPage)
}

export function getZoomScale(zoom: ReaderZoom, fitHeightScale: number) {
  return zoom.mode === 'fit-height' ? fitHeightScale : zoom.scale
}

export function canIncreaseZoom(scale: number) {
  return scale < MAX_MANUAL_SCALE
}

export function canDecreaseZoom(scale: number) {
  return scale > MIN_MANUAL_SCALE
}

export function increaseZoom(zoom: ReaderZoom, fitHeightScale: number): ReaderZoom {
  const scale = getZoomScale(zoom, fitHeightScale)

  if (!canIncreaseZoom(scale)) {
    return zoom
  }

  return {
    mode: 'manual',
    scale: Math.min(Math.max(scale + MANUAL_SCALE_STEP, MIN_MANUAL_SCALE), MAX_MANUAL_SCALE),
  }
}

export function decreaseZoom(zoom: ReaderZoom, fitHeightScale: number): ReaderZoom {
  const scale = getZoomScale(zoom, fitHeightScale)

  if (!canDecreaseZoom(scale)) {
    return zoom
  }

  return {
    mode: 'manual',
    scale: Math.min(Math.max(scale - MANUAL_SCALE_STEP, MIN_MANUAL_SCALE), MAX_MANUAL_SCALE),
  }
}
