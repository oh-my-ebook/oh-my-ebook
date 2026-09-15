# 기본 PDF Reader 구현 작업

## PDF 첫 페이지 표시

**완료 기준:** 텍스트·스캔 PDF의 첫 페이지를 원본 비율과 너비 맞춤으로 표시한다. 문서·페이지 표시 실패에서 재시도할 수 있고, 초기 화면을 실제 PDF와 worker로 검증한다. 탐색·보기 전환·크기 조절·패널 버튼은 아직 표시하지 않는다.

- [x] [T001] `package.json`, `pnpm-lock.yaml`에 `pnpm add pdfjs-dist`로 의존성을 추가하고 설치한 버전의 Node 요구사항을 확인한다. 버전이나 `--save-exact`를 지정하지 않는다.
- [x] [T002] `public/samples/basic-reader.pdf`에 직접 작성한 세로 텍스트 PDF 5장, `e2e/fixtures/pdf/scanned.pdf`에 이미지로만 된 세로 PDF 5장을 준비한다. 한글 폰트 포함, 페이지별 고유 번호·도형, 페이지 수·크기와 스캔 파일의 텍스트 부재를 확인한다. 테스트 실행 중 생성하지 않는 정적 파일로 준비한다.
- [x] [T003] `src/index.css`의 기존 테마 토큰을 확인하고 필요한 토큰만 보완한다. `src/components/ui/`에 현재 로딩·오류 화면에 필요한 Skeleton·Alert·Tooltip과 의존 컴포넌트만 공식 CLI로 추가한다. Button은 재사용하고 생성 코드의 Base UI API·의미 토큰·접근성·포맷을 검토한다.
- [x] [T004] `src/features/reader/hooks/use-pdf-document.test.ts`에 문서 로딩·재시도·페이지 크기 조회 실패·URL 변경·늦은 완료와 오류·StrictMode·unmount 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/pdf-document.ts`, `src/features/reader/hooks/use-pdf-document.ts`에 같은 패키지의 worker `?url` 설정, PDF 열기·회전 적용 크기 조회·해제를 구현한다. 손상·암호 필요 문서는 로딩을 끝내고 오류로 처리한다. 이전 응답을 무시하고 `destroy()` 실패도 처리한다. PDF 모듈 경계의 Promise를 제어해 검증하며 PDF.js 객체 전체를 타입 단언으로 위조하지 않는다. (FR-002, FR-006, FR-018)
- [x] [T005] `src/features/reader/hooks/use-reader-layout.test.tsx`, `src/features/reader/lib/reader-state.test.ts`에 한 페이지 너비 맞춤과 컨테이너 크기 변경 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/hooks/use-reader-layout.ts`에 `ResizeObserver` 측정과 정리를, `src/features/reader/lib/reader-state.ts`에 한 페이지 표시 배율 계산을 구현한다. client 폭에서 좌우 여백을 빼고 회전 후 `getViewport({ scale: 96 / 72 })` 크기를 100% 기준으로 사용한다. 수동 확대·두 페이지 계산은 이후 단계에서 추가한다. (FR-001, FR-015)
- [x] [T006] `src/features/reader/components/pdf-viewport.test.tsx`에 한 페이지 그리기·표시 크기 변경·작업 취소·늦은 완료와 오류·재시도 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/pdf-viewport.tsx`에서 요청마다 Canvas와 `RenderTask`를 관리하고 마지막 요청의 결과만 표시한다. 같은 Canvas에 동시에 그리지 않으며 CSS 크기와 DPR을 반영한 픽셀 크기를 구분한다. 이전 본문을 숨긴 로딩 상태, 보조 기술로 확인 가능한 안내, 페이지 표시 실패와 재시도를 제공한다. (FR-002, FR-018, FR-019)
- [ ] [T007] `src/app.test.tsx`에 제목·파일명 대체 표시·첫 페이지·너비 맞춤·로딩과 오류 화면 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader.tsx`, `src/features/reader/components/reader-toolbar.tsx`, `src/app.tsx`를 연결해 `/`에서 Reader를 표시한다. 제목과 `1 / 전체 페이지 수`를 보여주고, 로딩·오류에서 번호를 잘못 안내하지 않는다. `src/app.css`와 import를 제거하고 Tailwind로 고정 조작부와 스크롤 본문을 구성한다. 320px 화면에서도 제목·재시도 버튼이 잘리지 않고 전체 제목을 키보드로 확인할 수 있어야 한다. (FR-001, FR-003, FR-004, FR-005, FR-020)
- [ ] [T008] `e2e/app.spec.ts`의 카운터 검증을 초기 Reader 진입·새로고침 검증으로 교체한다. `e2e/basic-pdf-reader.spec.ts`에서 실제 텍스트·스캔 PDF 첫 페이지와 요청 실패 후 재시도를 확인한다. `page.route().fulfill({ path })`로 샘플을 바꾸고, 완료 상태와 고유 도형이 있는 텍스트·스캔 대표 본문 스냅샷을 직접 검토한다. 폰트·CMap·이미지 디코더 자원이 필요하면 `src/features/reader/lib/pdf-document.ts`에서 같은 패키지 버전의 필요한 자원만 자체 제공한다. `package.json`의 check·build·E2E 명령과 preview에서 PDF·worker 제공까지 검증한다. (SC-001의 첫 페이지 표시, SC-004의 로딩 복구, FR-021)

## 페이지 탐색

**선행 단계:** PDF 첫 페이지 표시. **완료 기준:** 텍스트·스캔 PDF에서 이전·다음·번호 입력·슬라이더로 이동한다. 잘못된 입력과 빠른 이동에도 마지막 유효 선택의 본문과 번호가 일치하며, 모든 탐색 조작을 키보드로 사용할 수 있다.

- [ ] [T009] `package.json`, `pnpm-lock.yaml`에 `pnpm add lucide-react`로 아이콘을 추가한다. `src/components/ui/`에는 Field·Input·Slider·Separator와 의존 컴포넌트를 공식 CLI로 추가한다. Slider는 현재 Base UI API를 확인하고 `[currentPage]`로 thumb 하나를 표시하도록 구성한다. thumb 색상은 의미 토큰을 사용하고 기존 테마·variant·키보드 동작을 유지한다.
- [ ] [T010] `src/features/reader/lib/reader-state.test.ts`에 한 페이지 보기의 앞뒤 이동·첫과 마지막 경계·번호 입력 검증 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/reader-state.ts`에 페이지 범위 계산과 입력 검증을 구현한다. 표지를 포함한 1부터의 번호를 사용하고 빈 값·문자·소수·지수 표기·범위 밖 값은 거부한다. (FR-005, FR-011, FR-012)
- [ ] [T011] `src/features/reader/components/page-navigator.test.tsx`, `src/features/reader/components/reader.test.tsx`에 이전·다음·번호 동기화·상단 스크롤·한 장 문서 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/page-navigator.tsx`, `src/features/reader/components/reader.tsx`에 이전·다음과 현재 번호를 연결한다. 첫·마지막 이동은 비활성화하고 로딩 중 사용할 수 없는 조작도 제한한다. 각 버튼에 접근 가능한 이름과 포커스를 제공한다. (FR-003, FR-005, FR-011, FR-013, FR-019)
- [ ] [T012] `src/features/reader/components/page-navigator.test.tsx`에 Enter 확정·잘못된 입력 후 위치 유지·오류 수정 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/page-navigator.tsx`에 Field·Input·FieldError로 번호 입력을 추가하고 한 장 문서에서 비활성화한다. 오류는 입력과 연결하고 보조 기술로 확인할 수 있게 한다. (FR-012, FR-013, FR-019)
- [ ] [T013] `src/features/reader/components/page-navigator.test.tsx`에 슬라이더 선택·키보드 이동·입력창과 동기화·한 장 문서 비활성화 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/page-navigator.tsx`에 PDF 페이지 단위 Slider를 연결한다. 반환값은 타입과 길이를 확인해 처리하며 320px 화면에서도 탐색 조작이 겹치지 않도록 배치한다. (FR-013, FR-019, FR-020)
- [ ] [T014] `e2e/fixtures/pdf/single-page.pdf`에 한 장 문서를 준비한다. `src/features/reader/components/reader.test.tsx`, `src/features/reader/components/pdf-viewport.test.tsx`에서 페이지별 실패와 재시도·빠른 이동 중 늦은 결과 무시를 검증하고, 필요한 수정은 실패 테스트 확인 후 적용한다. `e2e/basic-pdf-reader.spec.ts`에서는 텍스트·스캔·한 장 문서의 탐색, 입력 오류 복구, 연속 이동 후 최종 본문, 키보드 조작과 320px 화면을 확인한다. `package.json`의 check·build·E2E 명령을 통과시킨다. (SC-001의 탐색, SC-004, SC-005의 탐색 조작)

## 한 페이지·두 페이지 보기

**선행 단계:** 페이지 탐색. **완료 기준:** 세로·가로·혼합 문서에서 누락·중복 없이 배치와 앞뒤 이동이 동작한다. 창 폭에 따른 제한·선호 복원·현재 페이지 유지까지 완성한다. 패널로 읽기 영역이 줄어드는 경우는 보조 패널과 반응형 동작 단계에서 추가 검증한다.

- [ ] [T015] `e2e/fixtures/pdf/`에 가로 3장·세로/세로/가로/세로/세로 5장·회전·정사각형 PDF를 준비하고 페이지별 크기·번호·도형을 확인한다. 세로 홀수 검증에는 기존 기본 샘플 5장을 재사용한다. `src/components/ui/`에 ToggleGroup과 의존 컴포넌트를 추가하고 현재 Base UI의 배열 값과 `multiple` API를 확인한다.
- [ ] [T016] `src/features/reader/lib/reader-state.test.ts`에 방향·함께 표시할 페이지·이전과 다음·오른쪽 페이지 선택 유지·두 페이지 너비 맞춤·화면 폭과 읽기 영역 폭의 독립적인 경계 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/reader-state.ts`에 세로 두 장, 가로와 홀로 남은 세로 단독, 표지 일반 처리, 간격을 포함한 같은 배율 계산을 구현한다. 화면 폭 1024px 이상과 읽기 영역 1000px 이상을 모두 만족해야 두 페이지를 허용하며, 계획의 두 페이지 지면 최대 폭 1100px를 적용한다. (FR-006부터 FR-011, FR-015, FR-016)
- [ ] [T017] `src/features/reader/components/pdf-viewport.test.tsx`에 양쪽 페이지 완료 대기·한쪽 실패·늦은 결과·보기 변경 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/pdf-viewport.tsx`에 최대 두 개의 Canvas 배치를 구현한다. 표시할 페이지가 모두 준비되면 본문과 표시 범위를 함께 갱신하고, 가로 분할이나 마지막 페이지 옆의 가상 지면은 만들지 않는다. (FR-005, FR-007, FR-009, FR-018)
- [ ] [T018] `src/features/reader/hooks/use-reader-layout.test.tsx`, `src/features/reader/components/reader-toolbar.test.tsx`, `src/features/reader/components/reader.test.tsx`에 보기 전환·폭 제한·선호 복원·현재 페이지 유지 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/hooks/use-reader-layout.ts`에 화면 폭의 `matchMedia` 측정·정리를 추가하고, `src/features/reader/components/reader-toolbar.tsx`, `src/features/reader/components/reader.tsx`, `src/features/reader/components/page-navigator.tsx`에 보기 전환과 두 페이지 탐색을 연결한다. ToggleGroup 해제가 빈 배열이면 선택을 유지하고 제한 사유는 hover 없이도 확인할 수 있게 한다. 키보드 전환과 포커스를 보존한다. (FR-003, FR-005, FR-010, FR-011, FR-016, FR-019)
- [ ] [T019] `e2e/basic-pdf-reader.spec.ts`에서 세로 홀수·가로·혼합·회전·정사각형·한 장 PDF의 앞뒤 이동과 실제 배치를 확인한다. 오른쪽 페이지 선택 후 보기 전환·창 폭 변경에도 현재 페이지가 유지되고, 폭이 복구되면 보기 선호가 복원되어야 한다. 화면 1023/1024px와 읽기 영역 999/1000px는 실제 측정값을 확인하며 검증한다. 대표 두 페이지 스냅샷을 직접 검토하고 `package.json`의 check·build·E2E 명령을 통과시킨다. (SC-002, SC-003의 창 크기 변경)

## 크기 조절

**선행 단계:** 한 페이지·두 페이지 보기. **완료 기준:** 확대·축소·확대율·너비 맞춤을 조작할 수 있다. 수동 배율은 페이지 이동과 창 크기 변경 후 유지되며, 확대된 본문의 모든 가장자리까지 스크롤할 수 있다.

- [ ] [T020] `src/features/reader/lib/reader-state.test.ts`에 수동 배율 25%부터 300%, 25%p 증감, 너비 맞춤 해제·복귀, 한도 밖에서 시작하는 조작 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/reader-state.ts`에 수동 배율 계산을 추가한다. 너비 맞춤 계산에는 수동 한도를 적용하지 않고 상한 이상에서 확대·하한 이하에서 축소를 비활성화해 조작 방향이 역전되지 않게 한다. (FR-014, FR-015)
- [ ] [T021] `src/features/reader/components/reader-toolbar.test.tsx`, `src/features/reader/components/reader.test.tsx`에 크기 조절·페이지 이동 후 배율 유지·키보드 조작 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader-toolbar.tsx`, `src/features/reader/components/reader.tsx`, `src/features/reader/components/pdf-viewport.tsx`에 확대·축소·확대율·너비 맞춤을 연결한다. 두 페이지에는 같은 배율을 적용하고 수동 조작은 너비 맞춤을 해제한다. 320px 화면에서도 새 조작부가 잘리거나 겹치지 않아야 한다. (FR-003, FR-014, FR-015, FR-019, FR-020)
- [ ] [T022] `e2e/basic-pdf-reader.spec.ts`에서 텍스트·스캔 PDF의 확대·축소·너비 맞춤·창 크기 변경·빠른 배율 변경을 검증한다. 수동 배율에서는 좌우·상하 가장자리까지 스크롤하고, 너비 맞춤에서는 높이가 넘으면 세로 스크롤을 제공한다. 본문과 별도로 툴바·탐색 조작을 사용할 수 있는지 확인한다. 실패가 발견되면 `src/features/reader/components/pdf-viewport.test.tsx`에 재현 테스트를 먼저 추가하고 수정한다. `package.json`의 check·build·E2E 명령을 통과시킨다. (SC-001의 크기 조절, SC-004의 배율 변경, SC-005의 크기 조절 조작)

## 보조 패널과 반응형 동작

**선행 단계:** 크기 조절. **완료 기준:** 빈 패널을 열고 닫을 수 있고, 패널이 차지하는 공간에 맞춰 보기 방식과 너비 맞춤이 동작한다. 키보드 포커스 복원과 좁은 화면 조작을 검증한다.

- [ ] [T023] `src/components/ui/`에 Collapsible·Sheet와 의존 컴포넌트를 추가한다. `src/index.css`의 기존 토큰을 사용하고 현재 Base UI의 포커스 API와 생성 코드의 키보드 동작을 확인한다. 다른 UI를 재설치하거나 프리셋을 변경하지 않는다.
- [ ] [T024] `src/features/reader/components/reader-panel.test.tsx`, `src/features/reader/components/reader.test.tsx`에 패널 열기·닫기·좁은 화면 전환·Escape·포커스 복원 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader-panel.tsx`, `src/features/reader/components/reader-toolbar.tsx`, `src/features/reader/components/reader.tsx`에 빈 패널을 연결한다. 화면 폭 1024px 이상은 본문 옆 320px 영역, 미만은 본문 위 Sheet를 사용한다. 제목과 닫기 조작만 제공하고 두 방식 모두 닫은 뒤 열기 버튼으로 포커스를 복원한다. (FR-017, FR-019)
- [ ] [T025] `src/features/reader/components/reader.test.tsx`에 패널 변경 후 현재 페이지·보기 선호·너비 맞춤·수동 배율 유지 테스트를 먼저 작성하고 실패가 있으면 해당 기능을 수정한다. `e2e/basic-pdf-reader.spec.ts`에서 패널로 읽기 영역이 999/1000px 경계를 지날 때 한 페이지 전환과 두 페이지 복원을 검증한다. 화면 1023/1024px의 패널 방식 전환, 가로 단독 유지, 320px 화면의 전체 조작부와 포커스도 확인한다. `package.json`의 check·build·E2E 명령을 통과시킨다. (SC-003, SC-005의 패널 조작, FR-010, FR-014부터 FR-017, FR-020)

## 전체 독서 흐름 검증

**선행 단계:** 보조 패널과 반응형 동작. **완료 기준:** 앞선 단계에서 완료한 기능을 함께 사용해도 SC-001부터 SC-006까지 만족한다. 이 단계에는 남은 기능의 신규 구현을 미루지 않고, 통합 검증과 검증에서 발견한 문제의 수정만 포함한다.

- [ ] [T026] `src/app.test.tsx`, `src/features/reader/components/reader.test.tsx`, `e2e/app.spec.ts`, `e2e/basic-pdf-reader.spec.ts`에서 탐색·보기·확대·패널을 조합한 독서 흐름과 새로고침 초기화를 검증한다. 목차·검색·북마크·설정·AI 도구가 없고 OCR·AI 서비스 없이 텍스트·스캔 독서를 완료하는지 확인한다. 초기 상태는 첫 페이지·한 페이지·너비 맞춤·패널 닫힘이며 영구 저장을 추가하지 않는다. 발견한 결함은 실패 테스트를 먼저 확인하고 관련 소스에서 수정한다. (FR-001, FR-003, FR-021, SC-001, SC-004, SC-006)
- [ ] [T027] `e2e/basic-pdf-reader.spec.ts`의 키보드 흐름을 기준으로 브라우저 메뉴에서 실제 200% 확대 후 전체 조작부·긴 제목·본문 스크롤·패널 포커스를 직접 확인한다. viewport 축소나 DPR 변경으로 대체하지 않는다. `src/features/reader/components/`에서 수정이 필요하면 재현 가능한 회귀 테스트를 먼저 추가하고 다시 확인한다. (SC-005)
- [ ] [T028] `package.json`의 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행하고 `pnpm preview`에서 PDF·worker·필요 자원과 실제 독서 흐름을 확인한다. `specs/basic-pdf-reader/spec.md`의 SC-001부터 SC-006까지 아래 대응표로 점검하고, `specs/basic-pdf-reader/tasks.md`에는 실제 완료한 항목만 체크한다. 실행 결과와 미실행 검증이 있다면 그 이유를 보고한다.

## 완료 기준과 검증 작업

| 완료 기준                                | 확인할 작업                                    |
| ---------------------------------------- | ---------------------------------------------- |
| SC-001: 텍스트·스캔 PDF 읽기와 크기 조절 | T008, T014, T022, T026                         |
| SC-002: 방향별 배치와 페이지 이동        | T016부터 T019                                  |
| SC-003: 화면·읽기 영역 폭 경계           | T016, T018, T019, T025                         |
| SC-004: 잘못된 입력·실패·늦은 응답       | T004, T006, T008, T012, T014, T017, T022, T026 |
| SC-005: 키보드·좁은 화면·브라우저 확대   | 각 UI 구현 작업, T014, T019, T022, T025, T027  |
| SC-006: 제외 기능 없이 독서 완료         | T026                                           |

최종 검증은 T028에서 확인한다.
