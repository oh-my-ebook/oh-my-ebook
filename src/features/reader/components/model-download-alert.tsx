import { TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  prepareWebLlmModel,
  useWebLlmModelStore,
  type WebLlmModelPhase,
  type WebLlmModelStatus,
} from '../lib/web-llm/webllm-model'

const BUTTON = {
  idle: { text: '다운로드', label: '모델 다운로드' },
  loading: { text: '준비 중', label: '모델 준비 중' },
  ready: { text: '완료', label: '모델 준비 완료' },
  error: { text: '재시도', label: '모델 준비 재시도' },
} satisfies Record<WebLlmModelStatus, { text: string; label: string }>

const PHASE_LABEL = {
  preparing: '모델 준비 중',
  downloading: '모델 다운로드 중',
  'loading-gpu': '저장된 모델을 GPU에 올리는 중',
  compiling: 'GPU 실행 준비 중',
} satisfies Record<WebLlmModelPhase, string>

function getStatusText(status: WebLlmModelStatus, error?: string) {
  switch (status) {
    case 'idle':
      return '채팅 전에 로컬 모델을 준비하세요.'
    case 'loading':
      return '모델 준비 중'
    case 'ready':
      return '준비 완료'
    case 'error':
      return error ?? '모델을 준비하지 못했습니다.'
  }
}

function handleDownload() {
  prepareWebLlmModel().catch((error: unknown) => {
    // 화면에는 사용자용 안내 문구만 보이므로, 원인 파악을 위해 실제 에러는 콘솔에 남긴다.
    console.error('모델을 준비하는 중 오류가 발생했습니다.', error)
  })
}

export function ModelDownloadAlert() {
  const { status, phase, progress, progressDetail, error } = useWebLlmModelStore()
  const button =
    status === 'loading' && phase === 'downloading'
      ? { text: '다운로드 중', label: '모델 다운로드 중' }
      : BUTTON[status]
  const progressText = [PHASE_LABEL[phase], progress > 0 && `${progress}%`, progressDetail]
    .filter(Boolean)
    .join(' · ')

  return (
    <Alert
      className="shrink-0 has-data-[slot=alert-action]:pr-2.5"
      role="status"
      variant={status === 'error' ? 'destructive' : 'default'}
    >
      {status === 'error' && <TriangleAlert />}
      <AlertTitle className="min-h-6 pr-18">Qwen2.5 1.5B</AlertTitle>
      <AlertDescription className={status === 'error' ? 'text-destructive/90' : undefined}>
        {status === 'loading' ? progressText : getStatusText(status, error)}
      </AlertDescription>
      {status === 'loading' && (
        <Progress
          aria-label={PHASE_LABEL[phase]}
          aria-valuetext={progressText}
          value={progress === 0 ? null : progress}
        />
      )}
      <AlertAction>
        <Button
          aria-label={button.label}
          disabled={status === 'loading' || status === 'ready'}
          onClick={handleDownload}
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
