import { vi } from 'vitest'

type GpuStub = { requestAdapter: () => Promise<{ features: ReadonlySet<string> } | null> }

// jsdom에는 navigator.gpu가 없어 WebGPU 지원 여부를 직접 흉내 낸다. 반환한 함수로 원래 상태를 복구한다.
export function stubGpu(gpu: GpuStub | undefined) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'gpu')
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu })
  return () => {
    if (original) {
      Object.defineProperty(navigator, 'gpu', original)
    } else {
      Reflect.deleteProperty(navigator, 'gpu')
    }
  }
}

export function stubSupportedGpu() {
  return stubGpu({ requestAdapter: async () => ({ features: new Set(['shader-f16']) }) })
}

class FakeWorker extends EventTarget {
  terminate = vi.fn()
}

// 생성된 워커를 돌려줘 테스트가 오류 이벤트를 보내거나 종료 여부를 확인할 수 있게 한다.
// 복구는 vi.unstubAllGlobals()로 한다.
export function stubWorker() {
  const instances: FakeWorker[] = []
  vi.stubGlobal(
    'Worker',
    class extends FakeWorker {
      constructor(..._args: unknown[]) {
        super()
        instances.push(this)
      }
    },
  )
  return instances
}
