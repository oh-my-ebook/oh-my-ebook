import type { AddBookInput } from './data/book'
import type { EbookClientCommand, EbookStoreCommand } from './commands'
import { EbookStoreError } from './errors'
import { getErrorCode } from './storage/errors'
import { executeCommand } from './storage/operations'

export class EbookStoreClient {
  private pending: Promise<void> | undefined

  request(command: EbookClientCommand, payload?: unknown): Promise<unknown> {
    return this.enqueue(command, payload, 3)
  }

  saveBook(input: AddBookInput): Promise<unknown> {
    return this.enqueue('saveBook', input, 1)
  }

  private enqueue(command: EbookStoreCommand, payload: unknown, attempts: number) {
    const operation = this.executeAfter(this.pending, command, payload, attempts)
    // 대기열에는 완료 여부만 남겨 큰 PDF 조회 결과를 계속 참조하지 않는다.
    this.pending = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  private async executeAfter(
    previous: Promise<void> | undefined,
    command: EbookStoreCommand,
    payload: unknown,
    attempts: number,
  ): Promise<unknown> {
    // DB와 PDF를 함께 다루는 작업 및 전체 삭제가 서로 끼어들지 않게 한다.
    // 앞선 요청의 오류는 해당 호출자가 처리하고 다음 요청은 계속 실행한다.
    await previous
    for (let attempt = 1; ; attempt += 1) {
      try {
        return (await executeCommand({ command, payload })) ?? null
      } catch (error) {
        const code = getErrorCode(error)
        if (code === 'locked' && attempt < attempts) continue
        if (code === 'storage-failed') console.error('Storage command failed', { command, error })
        throw new EbookStoreError(code, error)
      }
    }
  }
}
