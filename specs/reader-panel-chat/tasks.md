# 보조 패널 채팅 구현 작업

**선행 조건:** `plan.md`, `spec.md`(Clarifications 포함). 병렬 섹션 없이 순서대로 진행한다(Constitution: 기본적으로 한 번에 하나의 작업만 완료).

## Phase 1: 설정

- [x] [T001] `components.json`의 `registries`에 `"@assistant-ui": "https://r.assistant-ui.com/styles/{style}/{name}.json"`을 추가한다. `pnpm dlx shadcn@latest view @assistant-ui/thread`로 확인한 결과 메시지 목록·컴포저·스트리밍만 따로 떼어낸 프리미티브는 레지스트리에 없고, `@assistant-ui/thread` 하나가 메시지 목록+컴포저+첨부파일+음성 입력+추천 질문+분기+reasoning/tool-call UI를 한 파일(`thread.aui.tsx`)에 묶어 제공한다. 더 잘게 쪼갤 수 없어 `pnpm dlx shadcn@latest add @assistant-ui/thread`로 통째로 추가하고, 제외 범위에 해당하는 조작부(첨부파일·음성 입력·추천 질문·분기·편집·Export 등)가 실제로 화면에 보이는지·눌렀을 때 깨지는지는 T004A에서 확인 후 필요한 것만 제거한다. `--diff`로 `src/index.css` 변경을 먼저 확인(기존 토큰 변경 없음, `tw-shimmer` import와 Collapsible 키프레임·Base UI data-open/closed variant만 추가)한 뒤 적용했다. CLI가 생성한 `src/components/assistant-ui/`, `src/hooks/use-attachment-src.ts`, `src/hooks/use-copy-to-clipboard.ts`는 `src/components/ui/`와 같은 이유로 `.prettierignore`에 추가해 포맷 검사에서 제외했다. `package.json`, `pnpm-lock.yaml`에 `@assistant-ui/react`, `@assistant-ui/react-markdown`, `remark-gfm`, `tw-shimmer`, `zustand`가 반영됐다.

## Phase 2: Mock 응답 어댑터 (기반)

**완료 기준:** 실제 AI 백엔드 없이 스트리밍 텍스트를 생성하고, 실패·재시도를 재현할 수 있는 `ChatModelAdapter`가 준비된다. 이후 모든 UI 작업이 이 어댑터에 의존한다.

- [x] [T002] `src/features/reader/lib/mock-chat-adapter.test.ts`에 스트리밍 조각이 누적되어 최종 텍스트가 되는 경우, 실패가 주입됐을 때 오류를 던지는 경우, 재시도 시 같은 입력으로 다시 스트리밍하는 경우를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/mock-chat-adapter.ts`에 `ChatModelAdapter`를 구현한다. `run()`은 고정 지연 후 누적 텍스트를 `yield`하는 async generator로 만들고, 실행 결과를 결정하는 부분(성공/실패/지연)은 테스트가 제어 가능한 형태로 분리해 실제 `setTimeout` 의존 없이 검증한다. 제어 가능한 Promise는 기존 `src/test/promise-controller.ts` 패턴을 재사용한다. (FR-003, FR-004)

## Phase 3: 채팅 UI

**완료 기준:** 보조 패널 안에서 질문을 보내고 스트리밍 응답을 확인할 수 있다.

- [x] [T003] `src/features/reader/components/reader-chat.test.tsx`에 질문 입력 후 Enter 전송 시 대화 내역에 질문이 먼저 추가되고 이어서 응답이 스트리밍 조각으로 갱신되며 완료 시 스트리밍 상태가 해제되는 테스트, Shift+Enter는 줄바꿈만 하고 전송하지 않는 테스트, 빈 값·공백만 있는 입력은 전송하지 않는 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader-chat.tsx`에 `AssistantRuntimeProvider` + `useLocalRuntime(chatModel)`로 런타임을 구성하고 T001에서 받은 `Thread`(`@/components/assistant-ui/elements/thread.aui`)를 그대로 사용한다. `chatModel`은 기본값 `mockChatModelAdapter`를 쓰되 prop으로 주입 가능하게 해 테스트에서 `createMockChatModelAdapter` + `promise-controller`로 제어했다. jsdom에 없는 `ResizeObserver`(테스트별 factory)와 `Element.scrollTo`(전역 no-op, `src/test/setup.ts`에 `matchMedia`와 같은 방식으로 추가)를 보강했다. (FR-001, FR-002, FR-003)
- [ ] [T004] `src/features/reader/components/reader-chat.test.tsx`에 응답을 받는 동안 로딩 상태가 표시되고 전송이 비활성화되는 테스트, 실패 시 오류 안내와 재시도 조작이 나타나는 테스트, 재시도하면 같은 질문으로 다시 응답을 받는 테스트를 먼저 작성해 실패를 확인한다. `T002`의 Mock 어댑터에 실패를 주입해 검증하고, `reader-chat.tsx`에 필요한 로딩·오류·재시도 처리를 추가한다. (FR-004)
- [ ] [T004A] `pnpm dev`에서 실제로 `ReaderChat`을 렌더링해 T001에서 그대로 받은 `thread.aui.tsx`의 제외 범위 해당 조작부(첨부파일 추가 버튼, 음성 입력 마이크, 추천 질문 칩, 답변 편집·재생성·Export as Markdown, 분기 선택)가 우리 Mock 런타임에서 실제로 보이는지 확인한다. 런타임이 해당 capability를 선언하지 않아 저절로 숨는 것은 그대로 둔다. 보이는데 눌렀을 때 아무 동작도 안 하거나 깨지는 조작부(제외 범위와 직접 겹치는 것 우선)는 `thread.aui.tsx`에서 해당 JSX·import와 사용하지 않게 된 `registryDependencies` 파일을 제거한다. 제거·유지 결정과 이유를 커밋 메시지나 PR에 남긴다.

## Phase 4: 페이지 번호 전달과 패널 연결

**완료 기준:** 보조 패널이 열려 있을 때만 채팅이 보이고, 질문에는 전송 시점의 현재 페이지 번호가 함께 전달된다.

- [ ] [T005] `src/features/reader/components/reader-panel.test.tsx`에 패널이 열려 있을 때만 채팅 조작부(질문 입력)가 보이는 테스트, 패널을 닫으면 채팅 UI가 사라지는 테스트를 먼저 작성해 실패를 확인한다. `reader-panel.tsx`의 `WideReaderPanel`·`NarrowReaderPanel` 콘텐츠 영역에 `ReaderChat`을 연결하고 현재 페이지 번호를 prop으로 받도록 한다. (FR-001)
- [ ] [T006] `src/features/reader/components/reader-chat.test.tsx`에 전송한 질문에 현재 페이지 번호가 함께 전달되는지 확인하는 테스트(Mock 어댑터 호출 인자 검증)를 먼저 작성해 실패를 확인한다. `reader-chat.tsx`가 전송 시점의 `currentPage` prop 값을 어댑터 호출 컨텍스트에 싣도록 구현한다. `src/features/reader/components/reader.tsx`에서 `firstPage.pageNumber`를 `ReaderPanel` → `ReaderChat`까지 전달한다. 페이지 탐색 기능은 이 범위 밖이라 값은 항상 1이지만 배선은 실제 이동 값을 그대로 받을 수 있는 구조로 만든다. (FR-005)
- [ ] [T007] `src/features/reader/components/reader-panel-integration.test.tsx`에 패널을 닫았다가 다시 열면 대화 내역이 초기화되는 테스트를 먼저 작성해 실패를 확인한다. Base UI `Collapsible.Panel`/`Dialog.Popup`이 닫힐 때 콘텐츠를 언마운트하는 기존 동작으로 통과하는지 확인하고, 통과하지 않으면 `reader-chat.tsx`에 명시적 초기화를 추가한다. (FR-006)

## Phase 5: 접근성과 반응형

**완료 기준:** 키보드만으로 조작할 수 있고 스크린 리더로 로딩·응답 갱신을 확인할 수 있으며, 넓은 화면·Sheet·320px 모두에서 레이아웃이 깨지지 않는다.

- [ ] [T008] `src/features/reader/components/reader-chat.test.tsx`에 Tab으로 입력·전송·재시도 조작부를 순서대로 이동할 수 있는지, 각 조작부에 접근 가능한 이름이 있는지, 스트리밍 갱신·완료가 보조 기술로 확인 가능한 영역(`aria-live` 등)에 반영되는지 테스트를 먼저 작성해 실패를 확인한다. assistant-ui 프리미티브의 기본 제공 여부를 먼저 확인하고 부족한 부분만 `reader-chat.tsx`에서 보강한다. (FR-007)
- [ ] [T009] `src/features/reader/components/reader-panel-integration.test.tsx`에 좁은 화면(Sheet)에서 대화 내역이 길어져도 채팅 영역 안에서만 스크롤되고 조작부가 잘리지 않는 테스트를 먼저 작성해 실패를 확인한다. 필요하면 `reader-chat.tsx`의 레이아웃을 `ReaderPanel`의 기존 스크롤 컨테이너에 맞춰 조정한다. 320px 폭 확인은 T011의 E2E에서 실제 브라우저로 검증한다. (FR-008)

## Phase 6: 통합 검증

- [ ] [T010] `src/features/reader/components/reader-panel-integration.test.tsx`에 답변을 받는 중 다음 페이지로 이동한 뒤 새 질문을 보내면 이전 대화는 유지되고 새 질문은 이동한 페이지 번호를 기준으로 처리되는 시나리오를 먼저 작성해 실패를 확인한다. `T006`의 배선으로 통과하지 않으면 필요한 부분을 보강한다. (FR-005, SC-004)
- [ ] [T011] `e2e/reader-panel-chat.spec.ts`를 작성해 실제 브라우저에서 질문 전송 → 스트리밍 응답 표시 → 실패 유도 후 재시도, 좁은 화면 Sheet에서의 동일 흐름, 320px 폭에서 조작부가 잘리지 않는지를 확인한다. 단위·통합 테스트의 세부 조건은 반복하지 않고 실제 사용자 흐름만 검증한다.
- [ ] [T012] `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행한다. `specs/reader-panel-chat/spec.md`의 SC-001부터 SC-006까지 아래 대응표로 점검하고, 실행 결과와 미실행 검증이 있다면 이유를 보고한다. 검증이 통과하면 `tasks.md`에 실제 완료한 항목만 체크한다.

## 완료 기준과 검증 작업

| 완료 기준                                                      | 확인할 작업      |
| -------------------------------------------------------------- | ---------------- |
| SC-001: 질문 전송 후 대화 내역·스트리밍 순차 표시              | T003, T011       |
| SC-002: 응답 중 전송 비활성화, 완료 후 재전송                  | T004, T011       |
| SC-003: 실패 시 오류·재시도                                    | T002, T004, T011 |
| SC-004: 페이지 이동 후 대화 유지, 새 질문은 이동한 페이지 기준 | T006, T010, T011 |
| SC-005: 키보드 조작·스크린 리더 확인                           | T008, T011       |
| SC-006: 320px·Sheet에서 레이아웃 유지                          | T009, T011       |

최종 검증은 T012에서 확인한다.
