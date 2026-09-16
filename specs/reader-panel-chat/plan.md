# 보조 패널 채팅 구현 계획

## 기술 구성

기존 React 19·TypeScript 6·Vite 8 앱에 새 라우터·서버·전역 상태 라이브러리를 추가하지 않는다. `basic-pdf-reader`가 만든 `ReaderPanel`의 빈 콘텐츠 영역에 채팅 UI를 채우고, 실제 AI 백엔드 연동 없이 Mock 응답으로 UI·스트리밍 동작만 구현한다([Clarifications](spec.md#clarifications) 참고).

| 구분       | 선택과 적용                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 채팅 UI    | [assistant-ui](https://www.assistant-ui.com) 레지스트리를 `components.json`에 등록하고 실제 사용하는 프리미티브만 shadcn CLI로 추가                      |
| 프리미티브 | assistant-ui 레지스트리가 `components.json`의 `style`(`base-nova`, `base-` 접두)을 읽어 **Base UI 플레이버**를 제공 — 기존 Radix 미도입 원칙과 충돌 없음 |
| 상태       | assistant-ui의 `useLocalRuntime` + `ChatModelAdapter`. 런타임 내부 상태 관리에 `zustand`를 필수 의존성으로 허용(가정 항목 참고)                          |
| 응답 생성  | 실제 AI API 호출 없이 `ChatModelAdapter.run()`을 로컬 async generator로 구현해 지연 후 텍스트를 스트리밍                                                 |
| 아이콘     | 기존 `lucide-react` 재사용                                                                                                                               |
| 검증       | 기존 Vitest·Testing Library·jsdom·Playwright Chromium 재사용                                                                                             |

### 레지스트리 등록

`components.json`의 `registries`에 아래 항목을 추가한다.

```json
{
  "registries": {
    "@assistant-ui": "https://r.assistant-ui.com/styles/{style}/{name}.json"
  }
}
```

`{style}`은 현재 값(`base-nova`)으로 자동 치환되어 Base UI 버전 컴포넌트를 내려받는다. AGENTS.md의 "현재 작업에서 실제로 사용하는 컴포넌트만 추가한다" 원칙에 따라, 정확한 컴포넌트 이름은 구현 단계에서 `pnpm dlx shadcn@latest view @assistant-ui/<name>`으로 확인한 뒤 대화 목록·입력창 스트리밍 표시에 필요한 최소 구성만 추가한다. 음성 입력·첨부파일·분기(BranchPicker)·LaTeX 등 제외 범위에 해당하는 프리미티브는 추가하지 않는다.

## Mock ↔ 실제 연동 경계

`src/features/reader/lib/mock-chat-adapter.ts`에 `ChatModelAdapter`를 구현한다. `run()`은 async generator로, 고정 지연 후 누적된 텍스트를 `yield`해 스트리밍을 흉내 낸다. 이 파일이 향후 실제 AI 백엔드(web-llm) 연동으로 교체될 지점이며, `ChatModelAdapter` 인터페이스를 그대로 유지한 채 내부 구현만 교체하면 되도록 어댑터 바깥(컴포넌트, 런타임 연결 코드)은 Mock 여부를 알지 못하게 분리한다.

실패 재현(FR-004)은 어댑터에 주입 가능한 응답 소스로 분리해, 테스트에서는 `createPromiseController` 같은 제어 가능한 Promise로 성공·실패·지연을 결정하고, 실제 실행에서는 항상 성공하는 기본 Mock 텍스트를 사용한다.

## 페이지 번호 전달 (FR-005)

`Reader`는 현재 첫 페이지만 표시하며 페이지 탐색 기능이 없어 `firstPage.pageNumber`는 항상 `1`이다(페이지 탐색은 이 기능 범위 밖). `Reader → ReaderPanel → ReaderChat`로 현재 페이지 번호를 prop으로 전달하고, 메시지 전송 시점의 값을 어댑터 호출의 컨텍스트에 싣는다. 페이지 탐색이 추가되면 이 배선을 바꾸지 않고 실제로 바뀌는 값이 그대로 전달된다.

## 컴포넌트 배치

- `src/features/reader/components/reader-panel.tsx`: `WideReaderPanel`·`NarrowReaderPanel`의 빈 콘텐츠 영역에 `ReaderChat`을 렌더링하도록 수정. 패널이 Base UI `Collapsible.Panel`/`Dialog.Popup`으로 닫힐 때 콘텐츠가 DOM에서 언마운트되는 기존 동작을 그대로 활용해 FR-006(패널을 닫으면 대화 내역 초기화)을 별도 리셋 로직 없이 만족시킨다.
- `src/features/reader/components/reader-chat.tsx` (신규): `AssistantRuntimeProvider` + `useLocalRuntime(mockChatModelAdapter)`로 런타임을 구성하고, assistant-ui의 Thread/Composer 프리미티브를 조합해 질문 입력·전송·대화 내역·스트리밍 표시를 구성한다.
- `src/features/reader/lib/mock-chat-adapter.ts` (신규): 위 Mock ↔ 실제 연동 경계.

## 상태·스트리밍·실패 처리 (FR-002~004)

- Enter 전송·Shift+Enter 줄바꿈, 빈 값/공백 전송 차단은 assistant-ui Composer 기본 동작을 우선 사용하고, 기본 동작이 요구사항과 다르면 최소한으로 재정의한다.
- 응답 대기 중 로딩 표시와 전송 비활성화는 런타임이 제공하는 진행 상태(`isRunning` 등)를 그대로 바인딩한다.
- 실패 시 오류 안내와 재시도는 런타임의 오류 상태 + 같은 사용자 메시지로 `run()`을 다시 호출하는 재시도 동작으로 구현한다.

## 접근성과 반응형 (FR-007, FR-008)

assistant-ui 프리미티브가 제공하는 접근 가능한 이름·키보드 조작·스트리밍 갱신 알림을 우선 확인하고, DESIGN.md의 포커스·대비 규칙에 못 미치는 부분만 보강한다. 채팅 영역은 `ReaderPanel`의 기존 스크롤 컨테이너(넓은 화면 320px 옆 영역/좁은 화면 Sheet) 안에 배치하고 채팅 자체의 내부 스크롤만 추가해 SC-006을 만족시킨다.

## 파일 구성

| 경로                                                               | 변경 내용                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `components.json`                                                  | `@assistant-ui` 레지스트리 등록                                |
| `src/features/reader/components/reader-chat.tsx`                   | 신규. 런타임 구성과 Thread/Composer 조합                       |
| `src/features/reader/components/reader-chat.test.tsx`              | 신규. 전송·스트리밍·로딩·재시도·접근성 테스트                  |
| `src/features/reader/components/reader-panel.tsx`                  | 콘텐츠 영역에 `ReaderChat` 연결, 현재 페이지 번호 전달         |
| `src/features/reader/components/reader-panel.test.tsx`             | 채팅 노출 조건(FR-001) 테스트 추가                             |
| `src/features/reader/components/reader-panel-integration.test.tsx` | 페이지 이동 후에도 대화 내역 유지(FR-005/SC-004) 시나리오 추가 |
| `src/features/reader/lib/mock-chat-adapter.ts`                     | 신규. `ChatModelAdapter` Mock 구현                             |
| `src/features/reader/lib/mock-chat-adapter.test.ts`                | 신규. 스트리밍 누적·실패·재시도 단위 테스트                    |
| `src/components/ui/`                                               | shadcn CLI로 추가되는 assistant-ui Base UI 컴포넌트 파일       |
| `package.json`, `pnpm-lock.yaml`                                   | `@assistant-ui/react`, `zustand` 등 실제 필요한 의존성만 반영  |
| `e2e/reader-panel-chat.spec.ts`                                    | 신규. 질문·응답·재시도·좁은 화면 흐름 E2E                      |

## 테스트 전략

| 검증              | 범위                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vitest 단위       | `mock-chat-adapter`의 스트리밍 누적, 실패 시 오류 형태, 재시도 시 같은 입력 재사용                                  |
| Testing Library   | Enter 전송/Shift+Enter 줄바꿈/빈 값 무시, 로딩 중 비활성화, 실패 후 재시도, 패널 닫힘 시 대화 초기화, 키보드 접근성 |
| 통합(Reader 연결) | 패널 열림에서만 채팅 노출(FR-001), 페이지 이동 후 대화 유지 + 새 질문은 이동한 페이지 기준(FR-005)                  |
| Playwright        | 실제 브라우저에서 질문 전송 → 스트리밍 표시 → 재시도, 좁은 화면 Sheet에서의 동일 흐름, 320px 폭 레이아웃            |

## 완료 확인

코드 변경 완료 시 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행한다. `pnpm dlx shadcn@latest add`로 추가한 컴포넌트는 `--dry-run`·`--diff`로 먼저 확인한다. 명세의 SC-001~SC-006과 위 테스트 전략을 대응시키고 실제 실행 결과를 보고한다. 계획 문서만 작성한 현재 단계에서는 문서 포맷·경로·명세 일치 여부를 검증한다.
