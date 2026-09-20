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
- [x] [T004] `src/features/reader/components/reader-chat.test.tsx`에 응답을 받는 동안 로딩 상태가 표시되고 전송이 비활성화되는 테스트, 실패 시 오류 안내와 재시도 조작이 나타나는 테스트, 재시도하면 같은 질문으로 다시 응답을 받는 테스트를 작성했다. `T002`의 Mock 어댑터에 실패를 주입해 검증한 결과 assistant-ui `Thread`가 로딩 중 전송 차단·`role="alert"` 오류 표시·재시도(Reload)를 이미 기본 제공해서 `reader-chat.tsx` 코드 변경은 필요 없었다. (FR-004)
- [x] [T004A] `pnpm dev` + Playwright로 `ReaderChat`을 실제로 렌더링해 확인한 결과:
  - **제거**: 첨부파일 추가(`+`) 버튼 — capability를 선언 안 했는데도 self-hide 되지 않고 그대로 보이며, 눌러도 실제로 AI에 전달하는 기능이 없어 제외 범위(첨부파일 업로드)와 직접 충돌하는 깨진 조작부였다. `thread.aui.tsx`에서 `ComposerAddAttachment`·`ComposerAttachments`·`UserMessageAttachments`·`AttachmentDropzone` 관련 JSX·import를 제거하고, 더 이상 어디서도 쓰지 않게 된 `attachment.aui.tsx`, `src/hooks/use-attachment-src.ts`, `src/components/ui/dialog.tsx`, `src/components/ui/avatar.tsx`를 삭제했다.
  - **유지(자동으로 숨음, 손 안 댐)**: 음성 입력 마이크(`capabilities.dictation` 미선언으로 self-hide), 분기 선택(`hideWhenSingleBranch`로 항상 숨음).
  - **유지(제외 범위 밖이거나 이미 활용 중)**: Reload(재생성) 버튼은 FR-004의 재시도로 이미 사용 중이라 유지. Copy·질문 수정(Edit)·More의 Export as Markdown은 제외 범위와 직접 겹치지 않는 부가 기능이라 지금은 남겨두고, UI 디자인은 이후 별도로 다듬는다.
  - **추가로 제거**: 추천 질문(초기 화면 칩 + 답변 후 팔로우업 칩)도 빈 상태로는 안 보이지만, 초기 화면 칩 wrapper는 `composer.isEmpty`가 꺼지는 순간(첫 글자 입력 시) 언마운트되면서 `gap-4`만큼 레이아웃이 밀려, 위의 환영 문구·입력창이 살짝 아래로 내려가는 시각 버그를 유발했다. 제외 범위(추천 질문 제시)와도 겹쳐 `ThreadSuggestions`·`ThreadSuggestionItem`·`ThreadFollowupSuggestions` 관련 JSX·import를 제거하고 이제 아무도 안 쓰는 `follow-up-suggestions.aui.tsx`를 삭제했다. Playwright로 첫 글자 입력 전후 입력창 좌표가 그대로인 것을 확인했다.
  - **애니메이션 수정**: Reload로 답변 버전을 만든 뒤 BranchPicker `<`(Previous)로 이전 버전을 보면, `AssistantMessage`·`UserMessage`가 다시 마운트되며 `fade-in slide-in-from-bottom-1 animate-in` 진입 애니메이션이 재생돼 메시지가 4px 아래로 순간 이동했다가 150ms 동안 원위치로 돌아오는 시각 버그를 Playwright 프레임 샘플링으로 확인했다. BranchPicker 자체는 유지(FR-004 재시도용 Reload와 함께 오는 부가 기능)하고, 두 컴포넌트 root의 진입 애니메이션 클래스만 제거해 해결했다.
  - **스크롤 위치 버그 수정**: 대화가 여러 개 쌓인 상태에서 마지막 메시지를 Reload한 뒤 Previous로 이전 버전을 보면, 대화 전체가 아래로 훅 내려오며 가려져 있던 이전 대화까지 갑자기 다 보이는 문제를 발견했다. `ThreadPrimitive.Viewport`의 `turnAnchor="top"`(새 메시지를 패널 위쪽에 고정하고 아래에 빈 공간을 미리 확보하는 모드)이 원인으로, 응답이 끝난 뒤에도 확보해둔 빈 공간(`scrollHeight`가 `clientHeight`보다 여러 백 px 더 큼)이 안 없어지고 남아있다가 버전 전환 시점에야 한꺼번에 정리되면서 스크롤이 강제로 맨 위로 튀는 것을 Playwright로 `scrollTop`·`scrollHeight` 비교해 확인했다. 라이브러리가 공식 지원하는 `turnAnchor="bottom"`(기본값, 새 메시지가 그냥 아래에 쌓이는 클래식 방식)으로 바꿔 이 버그 있는 서브시스템 자체를 쓰지 않도록 했다. 좁은 사이드 패널에는 이 방식이 더 자연스럽기도 하다. 같은 시나리오를 재현해 `scrollHeight`가 더 이상 부풀지 않는 것을 재확인했다.

## Phase 4: 페이지 번호 전달과 패널 연결

**완료 기준:** 보조 패널이 열려 있을 때만 채팅이 보이고, 질문에는 전송 시점의 현재 페이지 번호가 함께 전달된다.

- [x] [T005] `src/features/reader/components/reader-panel.test.tsx`에 패널이 열려 있을 때만 채팅 조작부(질문 입력)가 보이는 테스트, 패널을 닫으면 채팅 UI가 사라지는 테스트를 작성했다. `reader-panel.tsx`의 `WideReaderPanel`·`NarrowReaderPanel` 콘텐츠 영역에 `ReaderChat`을 연결하고 `currentPage?: number`를 prop으로 받아 전달하도록 했다(실제 사용은 T006). 패널이 열릴 때 `ReaderChat`의 `Thread`도 별도 `ResizeObserver`를 만들어서, `reader-panel-integration.test.tsx`의 읽기 영역 크기 테스트가 엉뚱한 인스턴스를 관찰하던 문제를 발견해 대상 요소 기준으로 콜백을 찾도록 수정했다. `pnpm dev` + Playwright로 넓은 화면·좁은 화면(Sheet) 모두 실제로 확인했다. (FR-001)
- [x] [T006] `src/features/reader/components/reader-chat.test.tsx`에 전송한 질문에 현재 페이지 번호가 함께 전달되는지 확인하는 테스트(Mock 어댑터 호출 인자 검증)를 먼저 작성해 실패를 확인했다. `mock-chat-adapter.ts`의 `MockResponder`가 `context: ModelContext`도 받도록 확장하고 `run()`이 `options.context`를 그대로 넘기게 했다. `reader-chat.tsx`에 `useAssistantInstructions({ instruction, disabled })`로 `currentPage`를 `context.system`에 싣는 `CurrentPageInstructions` 자식 컴포넌트를 추가했다(값이 바뀔 때마다 재등록되어 전송 시점의 최신 페이지가 실린다). `src/features/reader/components/reader.tsx`에서 `firstPage?.pageNumber`를 `ReaderPanel` → `ReaderChat`까지 전달한다. 페이지 탐색 기능은 이 범위 밖이라 값은 항상 1이지만 배선은 실제 이동 값을 그대로 받을 수 있는 구조다. (FR-005)
- [x] [T007] `src/features/reader/components/reader-panel-integration.test.tsx`에 패널을 닫았다가 다시 열면 대화 내역이 초기화되는 테스트를 작성했다. Base UI `Collapsible.Panel`/`Dialog.Popup`이 닫힐 때 콘텐츠를 언마운트하는 기존 동작만으로 통과해, `reader-chat.tsx`에 별도 초기화 로직을 추가하지 않았다. 응답을 끝까지 받은 뒤 닫도록 해 실행 중인 Mock 타이머가 테스트 밖으로 새지 않게 했다. (FR-006)

## Phase 5: 접근성과 반응형

**완료 기준:** 키보드만으로 조작할 수 있고 스크린 리더로 로딩·응답 갱신을 확인할 수 있으며, 넓은 화면·Sheet·320px 모두에서 레이아웃이 깨지지 않는다.

- [x] [T008] `src/features/reader/components/reader-chat.test.tsx`에 Tab 이동, 실패 후 재시도 조작부로 이동, 스트리밍 갱신·완료를 보조 기술로 확인 가능한지 테스트를 작성했다. 각 조작부의 접근 가능한 이름은 기존 테스트(role+name 쿼리)로 이미 검증되고 있어 중복 작성하지 않았다. 재시도 버튼은 대화 내역 쪽(입력창보다 앞)에 있어 Shift+Tab으로 거슬러 올라가야 닿는 실제 순서를 확인해 테스트에 반영했다. assistant-ui `Thread`에는 스트리밍 갱신을 알리는 라이브 리전이 없어서, `thread.aui.tsx`의 메시지 목록 컨테이너(`data-slot="aui_message-group"`)에 `role="log" aria-live="polite"`를 추가했다(`reader-chat.tsx`가 아니라 이미 있는 컴포넌트를 보강). (FR-007)
- [x] [T009] `src/features/reader/components/reader-panel-integration.test.tsx`에 좁은 화면(Sheet)에서 대화 3턴을 주고받아도 입력창·최신 메시지가 계속 표시되는 테스트를 작성했다. T005에서 이미 넣어둔 `ReaderPanel`의 `min-h-0 flex-1` 래퍼로 통과해 `reader-chat.tsx` 레이아웃 변경은 필요 없었다(jsdom은 실제 overflow·클리핑을 재현하지 못해 "잘리지 않는다"는 이 테스트로는 완전히 검증되지 않는다). 320px 폭에서 실제로 안 잘리는지는 Playwright로 직접 스크린샷을 찍어 확인했고, T011의 E2E로도 다시 검증한다. (FR-008)

## Phase 6: 통합 검증

- [x] [T010] main에 병합된 PDF 페이지 탐색 기능(PR #29)을 `feat/reader-panel-chat`으로 머지해 실제 페이지 이동으로 검증할 수 있게 했다. 머지 과정에서 `reader.tsx`에 남아있던 `firstPage?.pageNumber`(더 이상 존재하지 않는 변수) 참조를 실제 `currentPage` 상태로 교체하는 타입 에러를 수정했다. `src/features/reader/components/reader-panel-integration.test.tsx`에 1페이지에서 질문 → 응답 → 다음 페이지 이동 → 새 질문을 보내는 시나리오를 작성했다. `mock-chat-adapter` 모듈을 스파이로 감싸 응답 소스 호출 인자(질문·`context.system`)를 직접 검증해, 이전 대화가 유지되고 새 질문엔 이동한 페이지 번호(2)가 실린 것을 확인했다. 이 스파이가 기존 400ms 타이머 기반 Mock을 즉시 응답으로 대체해 파일의 다른 테스트들도 함께 빨라졌다. (FR-005, SC-004)
- [x] [T011] `e2e/reader-panel-chat.spec.ts`를 작성해 실제 브라우저에서 질문 전송 → 스트리밍 응답 표시, 좁은 화면 Sheet에서의 동일 흐름과 320px 폭에서 조작부가 화면 밖으로 잘리지 않는지(뷰포트 경계·가로 스크롤 없음)를 확인했다. 프로덕션 `mockChatModelAdapter`는 항상 성공하도록만 만들어져 있어 실제 브라우저에서 실패를 유도할 방법이 없다는 것을 확인했고, 실패·재시도는 이미 T004에서 controllable adapter로 충분히 검증돼 있어 E2E 범위에서 제외했다(사용자 확인 후 결정).
- [x] [T012] `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행해 모두 통과를 확인했다. `specs/reader-panel-chat/spec.md`의 SC-001부터 SC-006까지 아래 대응표로 점검했다.

## 완료 기준과 검증 작업

| 완료 기준                                                      | 확인할 작업 |
| -------------------------------------------------------------- | ----------- |
| SC-001: 질문 전송 후 대화 내역·스트리밍 순차 표시              | T003, T011  |
| SC-002: 응답 중 전송 비활성화, 완료 후 재전송                  | T004        |
| SC-003: 실패 시 오류·재시도                                    | T002, T004  |
| SC-004: 페이지 이동 후 대화 유지, 새 질문은 이동한 페이지 기준 | T006, T010  |
| SC-005: 키보드 조작·스크린 리더 확인                           | T008        |
| SC-006: 320px·Sheet에서 레이아웃 유지                          | T009, T011  |

T011의 E2E는 프로덕션 Mock 어댑터가 항상 성공해 실패를 유도할 수 없어 SC-002·SC-003(전송 비활성화·재시도)과
SC-005(키보드·스크린 리더)는 다루지 않는다. 두 항목은 각각 T004, T008의 컴포넌트 테스트로 충분히 검증됐다.

## T012: 최종 검증

`pnpm check`(포맷·린트·타입·단위/통합 테스트 19개 파일 117개), `pnpm build`(프로덕션 빌드), `pnpm test:e2e`(7개, 기존
PDF 리더 5개 + 이번 기능 2개) 모두 통과했다. 위 대응표대로 SC-001~SC-006이 전부 근거 작업으로 커버된다. 미실행 검증
없음.

## Phase 7: 현재 페이지 본문 전달

- [x] [T013] 기존 `getBook` 결과에서 값이 있는 제목·저자·주제·키워드·출판사만 고르고, PaddleOCR·Kiwi 후처리 결과와 함께 `useAssistantContext({ getContext })`로 질문 전송 시점의 모델 컨텍스트에 포함했다. 페이지 이동 중 늦게 끝난 이전 결과는 문서·페이지 일치 검사로 제외하고, 빈 본문이나 OCR 실패는 질문을 막지 않는다. 메타데이터와 PDF 본문은 신뢰할 수 없는 참고 자료로 구분해 내부 지시를 따르지 않도록 안내한다. WebLLM 모델은 8,192토큰 컨텍스트로 불러온다. 선택 영역·추천 질문·RAG·토큰 예산 조정은 제외했다. 포맷·린트·타입 검사, 단위·통합 테스트 43개 파일 252개와 프로덕션 빌드가 통과했다. (FR-009, SC-007)

## Phase 8: 답변 분량 안내

- [x] [T014] 영어 모델 컨텍스트에 한국어 답변과 마지막 문장 완결 지시를 추가했다. 생성 하드 제한은 512토큰으로 유지했다. (FR-010, SC-008)

## Phase 9: 선택 영역 인용과 페이지 요약

- [x] [T015] PDF OCR 텍스트를 선택하면 `채팅에 추가`와 `자세히 설명`을 제공하고, 여러 인용문을 입력창 위의 줄바꿈 가능한 블록과 사용자 메시지에 표시한다. 각 인용문은 따로 삭제할 수 있고 자세한 설명에는 첨부한 모든 인용문을 전송한다. 인용문이 없는 새 대화에는 `이 페이지 요약` Suggestion을 표시한다. 포맷·린트·타입 검사, 단위·통합 테스트 43개 파일 261개와 프로덕션 빌드가 통과했다. (FR-011, FR-012, SC-009, SC-010)

## Phase 10: 모델 준비 단계와 캐시 사전 로딩

- [x] [T016] 다운로드·GPU 로딩·GPU 실행 준비를 한국어 단계와 현재 단계의 진행률로 표시한다. 앱 시작 시 완전한 모델 캐시가 있으면 기존 엔진을 미리 준비하고, 캐시가 없거나 불완전하면 수동 다운로드를 기다린다. 캐시 확인 실패·자동 준비 실패·중복 요청을 검증했다. `pnpm check`(57개 파일, 374개 테스트), `pnpm build`, `pnpm test:e2e --workers=1`(22개)이 통과했다. 기본 병렬 E2E는 두 실행에서 서로 다른 3개 항목이 시간 초과로 실패했다. (FR-013, SC-011)
