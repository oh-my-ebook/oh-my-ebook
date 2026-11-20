import type { InitProgressReport } from '@mlc-ai/web-llm'
import type { WebLlmModelPhase } from './web-llm.type'

export function getLoadingProgress({ text, progress }: InitProgressReport) {
  const phase: WebLlmModelPhase = text.startsWith('Fetching param cache')
    ? 'downloading'
    : text.startsWith('Loading model from cache')
      ? 'loading-gpu'
      : text.startsWith('Loading GPU shader modules')
        ? 'compiling'
        : 'preparing'
  const count = text.match(/\[(\d+\/\d+)\]/)?.[1]
  const megabytes = text.match(/(\d+)MB (?:fetched|loaded)/)?.[1]
  const progressDetail =
    phase === 'preparing'
      ? undefined
      : [
          count && `${count}개${phase === 'compiling' ? '' : ' 파일'}`,
          megabytes && `${megabytes}MB`,
        ]
          .filter(Boolean)
          .join(' · ') || undefined

  return { phase, progress: Math.round(Math.max(0, Math.min(1, progress)) * 100), progressDetail }
}

// 최초 로딩 실패와 생성 도중 실패 양쪽에서 공유하므로,
// "시작 실패"로 단정하는 문구 대신 두 경우 모두에 맞는 "실행 실패" 표현을 쓴다.
export function getModelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/WebGPU|shader-f16|compatible GPU/i.test(message)) {
    return '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.'
  }
  if (/Cache\.add|execute ['"]add['"] on ['"]Cache['"]/i.test(message)) {
    return '모델 파일을 브라우저에 저장하지 못했습니다. 기기 저장 공간을 확보한 뒤 다시 시도해 주세요. 계속 실패하면 VPN이나 네트워크 설정을 확인해 주세요.'
  }
  // "GPU에서 메모리 부족으로 모델 다운로드 실패"처럼 메모리·네트워크 단어가 함께 나올 수 있어,
  // 더 구체적인 메모리 판별을 네트워크보다 먼저 검사한다.
  // 또한 "GPU"만 단독으로 들어간 메시지는 메모리와 무관한 경우가 많아(예: GPU 어댑터 조회 실패) 판별에서 제외한다.
  if (/memory|allocation|device lost/i.test(message)) {
    return 'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
  }
  if (/fetch|network|download|ERR_FAILED|failed to load resource/i.test(message)) {
    return '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
  }

  return 'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'
}

export async function assertWebGpuSupport() {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ features: ReadonlySet<string> } | null> }
    }
  ).gpu
  if (!gpu) {
    throw new Error('WebGPU를 지원하지 않는 브라우저입니다.')
  }

  const adapter = await gpu.requestAdapter()
  if (!adapter || !adapter.features.has('shader-f16')) {
    throw new Error('필요한 GPU 기능(shader-f16)을 사용할 수 없습니다.')
  }
}
