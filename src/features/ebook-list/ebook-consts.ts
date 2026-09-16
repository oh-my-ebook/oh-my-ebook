export const EBOOK_STORE_ERROR_MESSAGES = {
  unsupported: '이 브라우저에서는 로컬 책장을 사용할 수 없습니다.',
  'persistence-denied': '영구 저장이 허용되지 않았습니다.',
  quota: '브라우저 저장 공간이 부족합니다.',
  duplicate: '이미 저장된 PDF입니다.',
  deleted: '이미 삭제된 PDF입니다.',
  locked: '다른 탭에서 저장소를 사용 중입니다. 다시 시도해 주세요.',
  'storage-failed': '로컬 저장소에 접근하지 못했습니다.',
} as const

export const EBOOK_STORE_COMMANDS = {
  initialize: 'initialize',
  listBooks: 'listBooks',
  getBook: 'getBook',
  addBook: 'addBook',
  deleteBook: 'deleteBook',
  updateProgress: 'updateProgress',
  updateCover: 'updateCover',
} as const
