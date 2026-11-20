export class NotFoundBookError extends Error {}
export class DuplicateBookError extends Error {}
export class DeletedBookError extends Error {}
export class InvalidDataError extends Error {
  constructor(operation: string) {
    super(`Invalid data for ${operation}`)
  }
}
