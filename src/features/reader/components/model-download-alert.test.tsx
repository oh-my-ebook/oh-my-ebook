import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelDownloadAlert } from './model-download-alert'

function getPreconnectLinks(origin: string) {
  return document.head.querySelectorAll(`link[rel="preconnect"][href="${origin}"]`)
}

describe('ModelDownloadAlert', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="preconnect"]').forEach((link) => link.remove())
  })

  it('여러 인스턴스가 동시에 떠 있으면, 하나가 사라져도 나머지가 쓰는 preconnect 링크는 유지된다', () => {
    const first = render(<ModelDownloadAlert />)
    render(<ModelDownloadAlert />)

    expect(getPreconnectLinks('https://huggingface.co')).toHaveLength(1)

    first.unmount()

    expect(getPreconnectLinks('https://huggingface.co')).toHaveLength(1)
  })

  it('마지막 인스턴스까지 사라지면 preconnect 링크를 정리한다', () => {
    const first = render(<ModelDownloadAlert />)
    const second = render(<ModelDownloadAlert />)

    first.unmount()
    second.unmount()

    expect(getPreconnectLinks('https://huggingface.co')).toHaveLength(0)
  })
})
