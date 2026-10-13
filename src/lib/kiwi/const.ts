export const KIWI_REQUEST = {
  NORMALIZE_TEXT: 'normalize-text',
  EXTRACT_SEARCH_TERMS: 'extract-search-terms',
} as const

export type KiwiRequestType = (typeof KIWI_REQUEST)[keyof typeof KIWI_REQUEST]

export const KIWI_MODEL_FILES = [
  'combiningRule.txt',
  'extract.mdl',
  'sj.morph',
  'cong.mdl',
  'nounchr.mdl',
] as const

export const SEARCH_TERM_TAGS = new Set([
  'NNG',
  'NNP',
  'NNB',
  'NR',
  'NP',
  'VV',
  'VA',
  'MAG',
  'SL',
  'SN',
])
