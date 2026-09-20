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

`{style}`은 현재 값(`base-nova`)으로 자동 치환되어 Base UI 버전 컴포넌트를 내려받는다. `pnpm dlx shadcn@latest view @assistant-ui/thread`로 확인한 결과 메시지 목록·컴포저·스트리밍만 따로 떼어낸 더 작은 프리미티브는 레지스트리에 없고, `@assistant-ui/thread` 하나가 필요한 것(메시지 목록·입력창·스트리밍)과 제외 범위에 해당하는 것(첨부파일·음성 입력·추천 질문·분기)을 한 파일에 같이 묶어 제공한다. 이 항목은 더 잘게 쪼갤 수 없으므로 통째로 추가하고, 제외 범위 조작부가 실제 화면에서 보이는지·동작하는지는 런타임 연결 후 개발 서버에서 직접 확인해 필요한 것만 제거한다(AGENTS.md "현재 작업에서 실제로 사용하는 컴포넌트만 추가한다" 원칙은 이 사후 정리 단계에서 지킨다). 질문 수정(사용자 메시지 Edit)·Export as Markdown은 spec.md가 제외한 "답변 편집"과 다른 대상이라 확인 후 남겨두기로 했다(tasks.md T004A).

## Mock ↔ 실제 연동 경계

`src/features/reader/lib/mock-chat-adapter.ts`에 `ChatModelAdapter`를 구현한다. `run()`은 async generator로, 고정 지연 후 누적된 텍스트를 `yield`해 스트리밍을 흉내 낸다. 이 파일이 향후 실제 AI 백엔드(web-llm) 연동으로 교체될 지점이며, `ChatModelAdapter` 인터페이스를 그대로 유지한 채 내부 구현만 교체하면 되도록 어댑터 바깥(컴포넌트, 런타임 연결 코드)은 Mock 여부를 알지 못하게 분리한다.

실패 재현(FR-004)은 어댑터에 주입 가능한 응답 소스로 분리해, 테스트에서는 `createPromiseController` 같은 제어 가능한 Promise로 성공·실패·지연을 결정하고, 실제 실행에서는 항상 성공하는 기본 Mock 텍스트를 사용한다.

## 페이지 번호 전달 (FR-005)

`Reader`가 소유한 `currentPage`를 `ReaderPanel`의 children으로 조합한 `ReaderChat`에 직접 전달하고, 메시지 전송 시점의 값을 어댑터 호출의 컨텍스트에 싣는다. 페이지를 이동해도 같은 배선으로 최신 값이 전달된다.

## 도서 메타데이터와 현재 페이지 본문 전달 (FR-009)

`PdfViewport`가 페이지를 표시할 때 이미 수행하는 PaddleOCR·Kiwi 후처리 결과를 재사용한다. 별도 OCR을 실행하지 않고 `lines[].text`를 줄바꿈으로 연결해 `Reader`가 `ReaderChat`에 전달한다. `Reader`는 결과와 문서가 일치할 때만 현재 페이지 본문을 선택해, 늦게 끝난 이전 문서나 페이지 결과가 섞이지 않게 한다.

리더가 이미 `getBook`으로 불러온 제목·저자·주제·키워드·출판사를 재사용하고, 값을 저장하지 않은 항목은 제외한다. 메타데이터를 다시 조회하지 않는다.

`ReaderChat`은 assistant-ui의 `useAssistantContext({ getContext })`로 도서 메타데이터와 본문을 모델 컨텍스트에 등록한다. 콜백은 질문을 보내는 시점에 평가되므로 기존 페이지 번호 지시와 함께 최신 본문이 `ChatModelAdapter`의 `context.system`에 포함된다. OCR 결과가 비어 있거나 실패하면 본문 컨텍스트만 생략하고 질문 기능은 유지한다. RAG 검색·인덱싱과 토큰 예산 조정은 이번 작업에 포함하지 않는다.

모델 컨텍스트는 영어로 작성하되 한국어로 답하도록 명시한다. 마지막에는 분량이 부족하면 세부사항을 생략하더라도 마지막 문장을 완결하라는 지시를 두고, 생성의 하드 제한인 `max_tokens: 512`는 유지한다.

## 선택 영역 인용과 페이지 요약 (FR-011, FR-012)

assistant-ui의 `SelectionToolbarPrimitive`는 채팅 메시지 안의 선택만 감지하므로 PDF OCR 텍스트 레이어에는 그대로 사용할 수 없다. `PdfViewport`에서 같은 페이지 안의 OCR 줄 선택을 감지해 줄 순서대로 본문을 만들고, 선택 영역 가까이에 shadcn Button으로 `채팅에 추가`와 `자세히 설명`을 표시한다.

선택 결과는 `Reader`를 거쳐 `ReaderChat`에 전달한다. assistant-ui의 `composer.setQuote()`는 인용 하나만 지원하므로, 여러 인용문을 단일 `quote.text`에 직렬화해 기존 메타데이터 흐름과 전송 후 초기화 동작을 유지한다. 입력창 위에서는 이를 다시 나눠 일정한 크기의 블록으로 표시하고 `flex-wrap`으로 다음 줄에 배치하며, 각 블록을 따로 삭제할 수 있게 한다. `자세히 설명`은 첨부한 모든 인용문을 설정한 뒤 사전 정의한 설명 프롬프트를 전송한다. WebLLM 어댑터는 각 인용문을 별도의 `<selected_quote>`로 구분해 질문과 함께 모델에 전달한다.

새 대화의 인용문이 없는 상태에는 `ThreadPrimitive.Suggestion`으로 `이 페이지 요약`을 표시하고 즉시 전송한다. 대화에는 `이 페이지에 대해 요약해줘`만 표시하며, WebLLM 어댑터에서 줄글 3문장과 본문의 핵심 개념을 최대 5개 불렛포인트로 요구하는 상세 영어 지시문으로 바꾼다. 여러 페이지를 가로지르는 선택은 제외한다.

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
| `src/components/assistant-ui/elements/`, `src/components/ui/`      | shadcn CLI로 추가되는 assistant-ui Base UI 컴포넌트 파일       |
| `package.json`, `pnpm-lock.yaml`                                   | `@assistant-ui/react`, `zustand` 등 실제 필요한 의존성만 반영  |
| `e2e/reader-panel-chat.spec.ts`                                    | 신규. 질문·응답·좁은 화면 흐름 E2E                             |

## 테스트 전략

| 검증              | 범위                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitest 단위       | `mock-chat-adapter`의 스트리밍 누적, 실패 시 오류 형태, 재시도 시 같은 입력 재사용                                                                                       |
| Testing Library   | Enter 전송/Shift+Enter 줄바꿈/빈 값 무시, 로딩 중 비활성화, 실패 후 재시도, 패널 닫힘 시 대화 초기화, 키보드 접근성                                                      |
| 통합(Reader 연결) | 패널 열림에서만 채팅 노출(FR-001), 페이지 이동 후 대화 유지 + 새 질문은 이동한 페이지 기준(FR-005)                                                                       |
| Playwright        | 실제 브라우저에서 질문 전송 → 스트리밍 표시, 좁은 화면 Sheet에서의 동일 흐름, 320px 폭 레이아웃(실패·재시도는 프로덕션 Mock이 항상 성공해 T004의 컴포넌트 테스트로 검증) |

## 완료 확인

코드 변경 완료 시 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행한다. `pnpm dlx shadcn@latest add`로 추가한 컴포넌트는 `--dry-run`·`--diff`로 먼저 확인한다. 명세의 SC-001~SC-006과 위 테스트 전략을 대응시키고 실제 실행 결과를 보고한다. 계획 문서만 작성한 현재 단계에서는 문서 포맷·경로·명세 일치 여부를 검증한다.
