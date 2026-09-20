import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearOpfs, deletePdf, readPdf, writePdf } from './ebook-db.worker.opfs'

const contentHash = 'a'.repeat(64)

interface OpfsFixture {
  abort: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  files: Map<string, Uint8Array>
  getDirectory: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
}

function createOpfsFixture(): OpfsFixture {
  const files = new Map<string, Uint8Array>()
  const write = vi.fn(async (data: ArrayBuffer | Uint8Array) => {
    files.set(
      `${contentHash}.pdf`,
      new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : data.slice().buffer),
    )
  })
  const close = vi.fn(async () => undefined)
  const abort = vi.fn(async () => undefined)
  const getFileHandle = vi.fn(async (name: string, options?: FileSystemGetFileOptions) => {
    if (!options?.create && !files.has(name))
      throw new DOMException('Missing file', 'NotFoundError')
    return {
      createWritable: vi.fn(async () => ({ write, close, abort })),
      getFile: vi.fn(async () => ({ arrayBuffer: async () => files.get(name)?.slice().buffer })),
    }
  })
  const removeEntry = vi.fn(async (name: string) => {
    if (!files.delete(name)) throw new DOMException('Missing file', 'NotFoundError')
  })
  const getDirectoryHandle = vi.fn(
    async (_name: string, options?: FileSystemGetDirectoryOptions) => {
      if (!options?.create && files.size === 0)
        throw new DOMException('Missing directory', 'NotFoundError')
      return { getFileHandle, removeEntry }
    },
  )
  const getDirectory = vi.fn(async () => ({ getDirectoryHandle }))
  vi.stubGlobal('navigator', { storage: { getDirectory } })

  return { abort, close, files, getDirectory, write }
}

afterEach(() => vi.unstubAllGlobals())

describe('ebook-db.worker.opfs', () => {
  it('콘텐츠 해시 파일명으로 PDF 원본을 저장하고 복사본을 읽는다', async () => {
    const fixture = createOpfsFixture()
    const source = new Uint8Array([1, 2, 3]).buffer

    await writePdf(contentHash, source)
    const stored = await readPdf(contentHash)

    expect(fixture.getDirectory).toHaveBeenCalledTimes(2)
    expect(fixture.write).toHaveBeenCalledWith(source)
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(stored).toEqual(new Uint8Array([1, 2, 3]))
    expect(stored.buffer).not.toBe(source)
  })

  it('쓰기 실패 시 writable 스트림을 중단하고 오류를 전달한다', async () => {
    const fixture = createOpfsFixture()
    const failure = new Error('write failed')
    fixture.write.mockRejectedValueOnce(failure)

    await expect(writePdf(contentHash, new ArrayBuffer(1))).rejects.toBe(failure)

    expect(fixture.abort).toHaveBeenCalledOnce()
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('PDF 원본을 삭제하고 존재하지 않는 파일도 안전하게 처리한다', async () => {
    const fixture = createOpfsFixture()
    await writePdf(contentHash, new Uint8Array([1]).buffer)

    await deletePdf(contentHash)
    await deletePdf(contentHash)

    expect(fixture.files).toEqual(new Map())
  })

  it('콘텐츠 해시 형식이 아니면 OPFS에 접근하지 않는다', async () => {
    const fixture = createOpfsFixture()

    await expect(readPdf('../unsafe')).rejects.toThrow('SHA-256 콘텐츠 해시')

    expect(fixture.getDirectory).not.toHaveBeenCalled()
  })

  it('OPFS 루트의 SQLite와 PDF를 재귀적으로 삭제한다', async () => {
    const removeEntry = vi.fn(async () => undefined)
    const entries = async function* () {
      yield ['ebook-library.sqlite3', {}] as [string, FileSystemHandle]
      yield ['pdfs', {}] as [string, FileSystemHandle]
    }
    vi.stubGlobal('navigator', {
      storage: { getDirectory: vi.fn(async () => ({ entries, removeEntry })) },
    })

    await clearOpfs()

    expect(removeEntry).toHaveBeenCalledWith('ebook-library.sqlite3', { recursive: true })
    expect(removeEntry).toHaveBeenCalledWith('pdfs', { recursive: true })
  })
})
