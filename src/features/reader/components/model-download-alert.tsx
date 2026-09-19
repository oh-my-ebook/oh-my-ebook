import { useEffect } from 'react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  prepareWebLlmModel,
  resetWebLlmModelCache,
  useWebLlmModelStore,
  type WebLlmModelStatus,
} from '../lib/web-llm/webllm-model'

// 모델 가중치는 Hugging Face에서, wasm 런타임 라이브러리는 raw.githubusercontent.com에서 받아온다.
// 다운로드 버튼을 누르기 전에 미리 연결(DNS+TCP+TLS)해 두면, 실제 클릭 시점의 연결 설정
// 지연과 그 사이의 실패 가능성을 줄일 수 있다.
const PRECONNECT_ORIGINS = ['https://huggingface.co', 'https://raw.githubusercontent.com']

// 이 컴포넌트가 동시에 여러 개 마운트될 수 있으므로(예: 여러 리더 패널), 링크를 참조
// 카운트로 관리한다. 그러지 않으면 한 인스턴스가 언마운트될 때 다른 인스턴스가 아직
// 쓰고 있는 공유 링크를 지워버릴 수 있다.
const preconnectLinksByOrigin = new Map<string, { link: HTMLLinkElement; refCount: number }>()

function usePreconnectModelOrigins() {
  useEffect(() => {
    for (const origin of PRECONNECT_ORIGINS) {
      const existing = preconnectLinksByOrigin.get(origin)
      if (existing) {
        existing.refCount += 1
        continue
      }
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = origin
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
      preconnectLinksByOrigin.set(origin, { link, refCount: 1 })
    }

    return () => {
      for (const origin of PRECONNECT_ORIGINS) {
        const existing = preconnectLinksByOrigin.get(origin)
        if (!existing) continue
        if (existing.refCount <= 1) {
          existing.link.remove()
          preconnectLinksByOrigin.delete(origin)
        } else {
          existing.refCount -= 1
        }
      }
    }
  }, [])
}

const BUTTON = {
  idle: { text: '다운로드', label: '모델 다운로드' },
  loading: { text: '다운로드 중', label: '모델 다운로드 중' },
  ready: { text: '완료', label: '모델 준비 완료' },
  error: { text: '재시도', label: '모델 다운로드 재시도' },
} satisfies Record<WebLlmModelStatus, { text: string; label: string }>

function getStatusText(status: WebLlmModelStatus, progress: number, error?: string) {
  switch (status) {
    case 'idle':
      return '채팅 전에 로컬 모델을 준비하세요.'
    case 'loading':
      return `모델을 다운로드하고 있습니다. ${progress}%`
    case 'ready':
      return '준비 완료'
    case 'error':
      return error ?? '모델 다운로드에 실패했습니다.'
  }
}

function handleDownload(status: WebLlmModelStatus) {
  // 실패 후 재시도는 손상됐을 수 있는 캐시를 먼저 지운다. 정상 캐시가 있는 최초 다운로드까지
  // 지우면 매번 다시 받게 되므로, error 상태의 재시도에만 적용한다.
  const start = status === 'error' ? resetWebLlmModelCache : prepareWebLlmModel
  start().catch((error: unknown) => {
    // 화면에는 사용자용 안내 문구만 보이므로, 원인 파악을 위해 실제 에러는 콘솔에 남긴다.
    console.error('모델을 준비하는 중 오류가 발생했습니다.', error)
  })
}

export function ModelDownloadAlert() {
  const { status, progress, error } = useWebLlmModelStore()
  const button = BUTTON[status]
  usePreconnectModelOrigins()

  return (
    <Alert
      className="shrink-0"
      role="status"
      variant={status === 'error' ? 'destructive' : 'default'}
    >
      <AlertTitle>Qwen2.5 1.5B</AlertTitle>
      <AlertDescription>{getStatusText(status, progress, error)}</AlertDescription>
      <AlertAction>
        <Button
          aria-label={button.label}
          disabled={status === 'loading' || status === 'ready'}
          onClick={() => handleDownload(status)}
          size="xs"
          type="button"
          variant="outline"
        >
          {button.text}
        </Button>
      </AlertAction>
    </Alert>
  )
}
