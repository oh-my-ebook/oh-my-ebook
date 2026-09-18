# 기본 PDF Reader 구현 계획

## 기술 구성

현재 React 19·TypeScript 6·Vite 8 앱의 시작 화면을 Reader로 교체한다. Node 24.21.0, pnpm 12.4.1, Tailwind CSS 4, shadcn Nova(Base UI), 기존 테마와 `@/` 경로 별칭을 유지한다. 별도 라우터·전역 상태 라이브러리·서버는 추가하지 않는다.

| 구분               | 선택과 적용                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| PDF                | `pnpm add pdfjs-dist`로 직접 의존성을 설치하고 Canvas에 렌더링                     |
| UI                 | 설치된 Button 재사용, 필요한 Base UI 컴포넌트만 공식 `@shadcn` 레지스트리에서 추가 |
| 아이콘             | `components.json`의 Lucide 설정에 맞춰 `lucide-react` 사용                         |
| 상태               | React의 지역 상태·reducer와 순수 함수                                              |
| 단위·통합 검증     | 기존 Vitest·Testing Library·jsdom                                                  |
| 실제 브라우저 검증 | 기존 Playwright Chromium 설정과 `e2e/` 재사용                                      |
| 샘플               | 저장소에 포함한 작은 PDF 파일, 런타임 생성이나 외부 PDF URL 없이 제공              |

PDF.js는 라이브러리 이름이고, `pdfjs-dist`는 바로 사용할 수 있도록 빌드한 PDF.js의 npm 배포 패키지 이름이다. 설치한 버전의 Node 요구사항을 확인하고 의존성 해석 결과는 `pnpm-lock.yaml`로 관리한다.

PDF.js는 역할을 **PDF 파일 해석(Core) → 페이지 그리기(Display) → 툴바 등이 있는 화면(Viewer)**으로 나눈 구조다. 여기서 계층은 각 부분이 앞부분의 기능을 바탕으로 동작하도록 나눈 것을 뜻한다.

- **Core**: PDF 파일 안의 글자·이미지·도형과 배치 정보를 해석한다.
- **Display**: Core가 해석한 정보를 이용해 페이지 크기를 조회하고 Canvas에 페이지를 그리는 API를 제공한다.
- **Viewer**: Display API에 툴바·페이지 이동 등의 UI를 붙인 PDF 뷰어 화면이다.

이번 구현은 `getDocument()`, `getPage()`, `getViewport()`, `render()` 같은 Display API를 호출해 문서를 열고 페이지 크기를 읽으며 Canvas에 그린다. 이 과정에서 필요한 PDF 파일 해석은 PDF.js가 처리하므로, 앱에서 Core의 내부 해석 코드를 직접 호출하거나 수정하지 않는다. PDF.js가 제공하는 Viewer 대신 React와 shadcn으로 툴바·페이지 탐색·한 페이지 및 두 페이지 보기 UI를 구성한다. [PDF.js의 Core·Display·Viewer 역할 설명](https://mozilla.github.io/pdf.js/getting_started/)

페이지 이동·확대 시 Canvas 렌더링과 이전 작업 취소를 앱에서 직접 제어하기 위해 `react-pdf`를 추가하지 않고 `pdfjs-dist`의 API를 직접 사용한다.

## 상태와 PDF 렌더링

### 문서 수명 관리

- `App`은 샘플 URL과 제목을 `Reader`에 전달한다. `/`에서 바로 Reader를 열고 사용자용 파일 선택 화면은 만들지 않는다.
- `use-pdf-document`가 문서 로딩·오류·재시도와 해제를 관리한다. `getDocument()`의 작업과 문서 참조는 서비스 컴포넌트 밖의 PDF 모듈에서 다룬다.
- 로딩 완료 후 페이지별 회전이 적용된 크기를 조회한다. 작은 샘플 전체의 방향 정보는 한 번 준비하되 Canvas는 현재 화면에 표시할 페이지마다 하나씩, 최대 두 개만 만든다. 방향 정보 조회 실패도 문서 준비 오류로 안내하고 재시도한다.
- URL 변경·재시도·unmount에서는 이전 작업을 정리한다. React StrictMode의 반복 setup/cleanup에서도 이미 해제한 문서나 worker를 재사용하지 않는다. `destroy()`의 Promise도 오류 처리한다. [PDFDocumentLoadingTask](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html)

PDF.js 본체와 같은 패키지의 `build/pdf.worker.min.mjs?url`을 import해 `GlobalWorkerOptions.workerSrc`에 지정한다. Vite가 개발·빌드에서 worker 자원 경로를 처리하게 하며 CDN과 수동 복사한 worker를 혼용하지 않는다. 샘플은 포함 폰트와 일반 이미지 형식으로 만들어 추가 CMap·표준 폰트·이미지 디코더 자원이 필요한지 실제 렌더링에서 확인한다. 필요한 자원은 같은 패키지 버전으로 자체 제공하고, 자원 오류를 텍스트 없는 문서로 간주하지 않는다. [Vite 자원 URL 처리](https://vite.dev/guide/assets.html)

### 독서 상태와 함께 표시할 페이지 결정

`reader-state.ts`에 함께 표시할 페이지 선택, 위치 이동, 입력 검증, 배율 계산을 순수 함수로 둔다. DOM 크기 측정과 PDF.js 객체는 전달하지 않고 페이지 크기와 숫자 값만 받는다.

| 상태                  | 역할                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| `currentPage`         | 마지막으로 선택한 PDF 페이지 번호. 두 페이지 보기에서 오른쪽 페이지를 선택해도 유지 |
| `preferredView`       | 사용자가 선택한 한 페이지·두 페이지 보기                                            |
| `zoom`                | `fit-height` 또는 수동 배율의 구분된 상태                                           |
| `panelOpen`           | 함께 읽기 패널 열림 여부                                                            |
| 문서·페이지 표시 상태 | 준비 중·표시 중·완료·오류를 구분                                                    |

화면에 표시할 페이지 번호와 앞뒤 이동 가능 여부는 페이지 정보, `currentPage`, `preferredView`, 화면·읽기 영역 폭으로 계산한다. 파생값을 별도 상태로 중복 저장하지 않는다. 화면 폭이 부족하거나 가로 페이지여도 `preferredView`를 바꾸지 않는다.

- 회전 적용 후 폭이 높이보다 큰 페이지는 가로, 나머지는 세로다. `getViewport()`로 크기를 얻으며 내용 분석은 하지 않는다. [PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)
- 두 페이지 보기에서 함께 표시할 페이지는 문서 처음부터 순서대로 정한다. 연속된 세로 페이지는 두 장씩 함께 표시하고, 가로 페이지와 짝이 없는 세로 페이지는 한 장만 표시한다. 표지도 같은 규칙을 따른다.
- 슬라이더는 선택 페이지를 유지한다. 첫·이전·다음·마지막 이동은 대상 화면에 표시할 페이지 중 첫 페이지를 선택한다. 예를 들어 모두 세로인 6페이지 문서에서 3·4페이지를 함께 보고 있다면 다음은 5·6페이지를 표시하고 현재 페이지는 5로 설정한다. 이동한 경우 본문을 상단으로 스크롤한다.
- 현재 페이지와 전체 페이지 수는 수정할 수 없는 텍스트로 표시한다. 슬라이더는 shadcn 공식 예시와 같이 현재 페이지를 한 요소 배열로 전달한다. 드래그 중에는 임시 위치와 페이지 텍스트만 갱신하고 `onValueCommitted`에서 본문 페이지를 변경해 반복 렌더링을 피한다. 트랙 클릭과 키보드 변경도 같은 확정 콜백으로 전달한다.
- 영구 저장을 추가하지 않는다. 새로고침 시 명세의 초기값으로 돌아온다.

### 페이지 변경 중 이전 작업 취소와 오류 처리 (race condition)

PDF 페이지를 그리는 작업은 즉시 끝나지 않는다. 예를 들어 1페이지를 그리는 중에 사용자가 2페이지로 이동하면, 1페이지 작업이 나중에 끝나더라도 화면이 다시 1페이지로 바뀌면 안 된다. 확대·축소하거나 창 크기를 바꿀 때도 마지막으로 선택한 페이지와 표시 크기에 맞는 결과만 보여준다.

`PdfViewport`는 페이지를 새로 그릴 때마다 요청을 구분하는 번호를 부여하고, 해당 요청에서 사용하는 Canvas와 `RenderTask`를 관리한다. 새 요청이 생기면 이전 작업을 취소한다. 작업이 완료되거나 실패했을 때는 마지막 요청인지 확인한 뒤 본문·로딩·오류 상태를 갱신한다. 취소한 작업의 결과나 오류는 현재 화면에 반영하지 않는다. 같은 Canvas에 이전 작업과 새 작업이 동시에 그리지 않도록 한다. [RenderTask 취소 API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-RenderTask.html)

새 페이지를 그리는 동안 이전 본문을 숨기고 Skeleton과 로딩 상태를 표시한다. 화면에 표시할 페이지가 모두 준비된 뒤 본문과 표시 범위를 함께 갱신한다. 두 장을 함께 표시하는 경우에는 양쪽 페이지가 모두 준비될 때까지 기다린다. 그리기에 실패하면 요청한 페이지를 표시하지 못했다는 안내와 재시도 버튼을 보여준다. 이전 본문을 새 페이지인 것처럼 표시하지 않는다. 문서 정보가 준비되어 있으면 페이지를 그리는 중에도 다른 페이지로 이동할 수 있다.

문서 파일을 불러오지 못한 경우에는 문서 로딩을 다시 시도하고, 특정 페이지를 그리지 못한 경우에는 해당 페이지를 다시 그린다. 페이지 이동 등으로 취소한 작업은 오류로 안내하지 않는다. 암호가 필요한 문서는 지원하지 않는다는 안내를 표시하고 로딩 상태를 끝낸다. 문서 로딩·페이지 그리기·작업 정리에서 발생하는 비동기 오류를 모두 명시적으로 처리한다.

## 크기 계산과 UI 구성

### Reader UI 개선

- 기존 의미 색상 토큰의 라이트·다크 값을 그대로 사용하고 `<html class="dark">`만 전환한다. PDF Canvas에는 색상 필터를 적용하지 않는다.
- 상단에는 독서 도구와 문서명을, 하단에는 페이지 탐색과 배율 조절을 배치한다. 아직 연결할 기능이 없는 돌아가기·책갈피 버튼은 별도 상태나 알림 없이 Button으로만 제공한다.
- 목차는 넓은 화면에서 헤더 없이 읽기 영역 왼쪽에 폭 280px 패널로 붙이고 목차 버튼으로 여닫는다. 좁은 화면에서는 제목과 닫기 조작만 있는 기존 Sheet를 왼쪽에서 연다. 목차 항목이나 임시 데이터를 만들지 않는다.
- 넓은 화면의 읽기 영역과 함께 읽기 패널은 shadcn Resizable로 조합한다. 패널을 닫으면 구분선과 패널을 제거하며 기존 열기 버튼 포커스 복원을 유지한다. 좁은 화면은 기존 Sheet를 재사용한다.
- 확대 조절은 기존 `ZoomControls` 동작을 유지한 채 하단 독서 위치 바로 옮긴다. 페이지·보기·채팅 상태와 계산 로직은 바꾸지 않는다.

### 스타일링 원칙

- Reader의 화면 스타일은 Tailwind CSS 유틸리티와 shadcn 컴포넌트 variant로 작성한다. `app.css`나 컴포넌트별 CSS·CSS Module 파일을 사용하지 않는다.
- 기존 `app.css`와 해당 import를 제거한다. `src/index.css`는 Tailwind 설정과 공통 테마 토큰·전역 기본 스타일 용도로 유지하며, Reader 전용 스타일 규칙은 추가하지 않는다.
- 색상·서체·모서리 등 디자인 값은 기존 테마 토큰을 사용한다. 필요한 표현 종류는 컴포넌트 variant에 정의하고, 사용처의 `className`은 레이아웃에 사용한다.

### 읽기 영역과 확대

- 기본 화면의 고정 폭·장식 레이아웃을 제거하고 Tailwind 유틸리티로 전체 화면 높이의 Reader 골격을 구성한다. 상단·하단은 내용에 맞춰 줄바꿈하고, 수동 확대처럼 본문이 읽기 영역을 넘을 때만 본문을 스크롤한다.
- `use-reader-layout`에서 화면 폭과 본문 컨테이너의 크기를 구분한다. 화면 기준은 `matchMedia`, 읽기 영역은 `ResizeObserver`로 측정한다. 읽기 영역의 실제 client 폭과 높이에서 각 방향의 여백을 뺀 값을 사용한다.
- 두 페이지 허용 조건은 화면 폭 `>=1024px`이다. 패널을 여닫을 때 보기 방식이 바뀌지 않도록 읽기 영역 가용 폭이나 본문 자체의 확대 폭은 판단에 쓰지 않는다.
- 높이 맞춤 배율은 `min(가용 높이 / 현재 표시하는 페이지 중 가장 큰 높이, 가용 너비 / 현재 표시하는 페이지 너비의 합)`으로 계산한다. 두 페이지를 표시할 때는 전체 폭에 페이지 사이 간격을 포함한다. 자동 맞춤에서는 현재 표시하는 모든 페이지가 읽기 영역 안에 들어와 가로·세로 스크롤이 생기지 않아야 하며, 폭이 남으면 가로 중앙에 배치한다.
- PDF의 기본 크기는 회전 적용 후 `getViewport({ scale: 96 / 72 })`로 얻은 CSS 크기로 정하고 이를 100%로 표시한다. 실제 Canvas 픽셀 크기는 표시 배율과 `devicePixelRatio`를 반영하되 CSS 크기와 확대율 표시는 분리한다.
- 수동 배율은 25%~300%, 증감은 25%p로 시작한다. 높이 맞춤의 계산값에는 이 한도를 적용하지 않는다. 수동 조작은 현재 표시 배율에서 증감 후 한도에 맞추고, 상한 이상에서는 확대·하한 이하에서는 축소를 비활성화해 버튼 동작이 역전되지 않게 한다.
- 배율이 바뀌면 Canvas 표시 영역의 너비와 높이를 200ms `ease-out`으로 전환한다. `prefers-reduced-motion: reduce`에서는 전환을 제거하며, Canvas 픽셀 크기는 마지막 배율에 맞춰 다시 그려 선명도를 유지한다.
- 수동 확대된 본문은 좌측과 상단도 스크롤로 도달할 수 있게 배치한다. 넘치는 자식을 강제로 가운데 정렬해 가장자리가 잘리지 않게 한다.

### 컴포넌트 조합

| 서비스 컴포넌트 | 책임과 사용할 UI                                                             |
| --------------- | ---------------------------------------------------------------------------- |
| `Reader`        | 독서 상태, 문서와 화면 조합, 로딩·오류 상태 연결                             |
| `ReaderToolbar` | Button, ToggleGroup, Tooltip, Separator로 보기·배율·패널 조작                |
| `PageNavigator` | 현재·전체 페이지 텍스트, Slider, 첫·이전·다음·마지막 Button                  |
| `PdfViewport`   | 본문 배치·수동 확대 스크롤, 페이지별 Canvas, Skeleton, Alert와 재시도 Button |
| `ReaderPanel`   | 넓은 화면은 Collapsible과 320px 보조 영역, 좁은 화면은 Sheet                 |

UI 추가는 현재 Base UI 설정에서 `pnpm dlx shadcn@latest`로 필요한 공식 컴포넌트만 진행한다. Button을 재설치하거나 프리셋을 변경하지 않는다. 색상·서체는 기존 토큰, 표현 종류는 내장 variant, 사용처 `className`은 레이아웃에 사용한다. 필요한 지면 표현은 테마 토큰을 참조하는 Tailwind 유틸리티로 정의하고 토큰 값을 복제하지 않는다.

슬라이더와 페이지 탐색·보기 방식의 아이콘 버튼에는 접근 가능한 이름을 제공하고, 해당 버튼에는 Tooltip을 붙인다. 두 페이지 보기를 적용할 수 없으면 보기 방식 조작을 숨기고, 두 페이지 보기 중 공간이 부족해지면 toast로 단면 표시를 알린다. 긴 문서명은 줄임 표시하되 전체 제목을 heading의 접근 가능한 이름으로 유지한다. 좁은 패널은 제목과 닫기 조작만 포함하고 `finalFocus`로 열기 버튼에 포커스를 돌린다. 넓은 패널도 닫을 때 같은 버튼으로 복원한다. [Slider](https://ui.shadcn.com/docs/components/base/slider), [Toast](https://ui.shadcn.com/docs/components/base/toast), [Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Dialog 포커스 API](https://base-ui.com/react/components/dialog)

공식 문서·레지스트리와 스킬을 비교한 결과는 다음과 같이 적용한다.

- ToggleGroup은 Base UI의 배열 값과 `multiple` API를 사용한다. 단일 선택 해제 결과가 빈 배열이면 기존 값을 유지한다. shadcn 문서의 `type="single"` 예시와 달리 현재 Base 레지스트리는 Base UI props를 그대로 사용하므로 해당 예시를 복사하지 않는다. [Base UI ToggleGroup](https://base-ui.com/react/components/toggle-group)
- Slider는 공식 예시처럼 한 요소 배열을 전달해 thumb 하나를 표시한다. 콜백 값은 배열 여부와 첫 값의 타입·범위를 확인해 좁히며 타입 단언을 추가하지 않는다. [shadcn Slider](https://ui.shadcn.com/docs/components/base/slider), [Base UI Slider](https://base-ui.com/react/components/slider)
- Slider 생성 코드는 수정하지 않는다. 진행 색상은 `src/index.css`의 `--primary`를 accent 초록색 값으로 정의해 연결하고, 기능 컴포넌트에서 thumb 배경도 같은 의미 색상으로 맞춘다. shadcn 기본 edge 정렬·thumb·키보드·포커스·포인터 동작을 유지한다. 드래그 중에는 페이지 텍스트만 갱신하고 본문 렌더링을 미뤄 기본 포인터 이동을 방해하지 않는다. `src/components/ui/`의 생성 포맷을 유지한다.

## 파일 구성

리더 전용 컴포넌트·훅·PDF 처리·탐색 로직은 `src/features/reader/`에 모은다. `src/components/`에는 공통 UI만 두며, shadcn 기본 UI는 `src/components/ui/`에 유지한다. 리더 전용 코드는 다른 기능에서도 실제로 필요해질 때 공통으로 옮긴다. 공통 코드는 리더에 의존하지 않으며 `app.tsx`에서 `Reader`를 연결한다. 라우팅과 `pages/`는 도입하지 않는다.

앱·페이지·컴포넌트·훅·유틸리티 파일 이름은 모두 kebab-case로 통일한다. 컴포넌트 함수 이름은 `PdfViewport`처럼 PascalCase를 유지하며, 테스트 파일은 `pdf-viewport.test.tsx`처럼 대상 파일 이름에 `.test`를 붙인다.

| 경로                                                   | 변경 내용                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `src/app.tsx`                                          | 기본 시작 화면을 샘플 Reader로 교체하고 `app.css` import 제거          |
| `src/app.css`                                          | 삭제하고 Reader 레이아웃은 Tailwind 유틸리티로 구성                    |
| `src/features/reader/components/reader.tsx`            | 상태 소유와 전체 화면 조합                                             |
| `src/features/reader/components/reader-toolbar.tsx`    | 상단 조작부                                                            |
| `src/features/reader/components/page-navigator.tsx`    | 페이지 텍스트·슬라이더·첫/앞뒤/마지막 이동                             |
| `src/features/reader/components/view-mode-control.tsx` | 한 페이지·두 페이지 보기 전환                                          |
| `src/features/reader/components/zoom-controls.tsx`     | 확대·축소·확대율·높이 맞춤 조작                                        |
| `src/features/reader/components/pdf-viewport.tsx`      | Canvas 렌더링과 표시 완료·오류 처리                                    |
| `src/features/reader/components/reader-panel.tsx`      | 반응형 함께 읽기 패널, 너비 조절과 포커스 복원                         |
| `src/features/reader/lib/pdf-document.ts`              | PDF.js worker 설정과 문서·페이지 정보 조회                             |
| `src/features/reader/lib/page-navigation.ts`           | 페이지 범위·첫/앞뒤/마지막 이동의 순수 계산                            |
| `src/features/reader/lib/page-spread.ts`               | 방향·함께 표시할 페이지·두 페이지 이동의 순수 계산                     |
| `src/features/reader/lib/reader-zoom.ts`               | 높이 맞춤·수동 배율의 순수 계산                                        |
| `src/features/reader/hooks/use-pdf-document.ts`        | 문서 로딩·재시도·수명 관리                                             |
| `src/features/reader/hooks/use-reader-layout.ts`       | 화면·읽기 영역 측정과 정리                                             |
| `src/components/ui/`                                   | 필요한 기본 컴포넌트와 Resizable 의존 컴포넌트를 CLI로 추가            |
| `src/index.css`                                        | Tailwind 설정·공통 테마 토큰·전역 기본 스타일 유지, 필요한 토큰만 추가 |
| `public/samples/basic-reader.pdf`                      | 기본 세로 텍스트 PDF                                                   |
| `e2e/fixtures/pdf/`                                    | 스캔·가로·혼합·한 장·회전·정사각형 검증 파일                           |
| `src/**/*.test.ts`, `src/**/*.test.tsx`                | 해당 소스 옆에 계산·상호작용·비동기 경계 테스트                        |
| `e2e/basic-pdf-reader.spec.ts`, `e2e/app.spec.ts`      | Reader E2E 추가, 기본 카운터 E2E를 Reader 진입·초기화 검증으로 교체    |
| `src/app.test.tsx`                                     | 기본 카운터 테스트를 Reader 초기 진입 검증으로 교체                    |
| `package.json`, `pnpm-lock.yaml`                       | PDF.js·아이콘과 UI에 필요한 의존성만 반영                              |

파일 분리는 위 책임에 필요한 수준으로 유지한다. EPUB 추상화, 문서 저장소, AI 통신 인터페이스, 범용 이벤트 시스템은 추가하지 않는다.

## 샘플과 검증

샘플은 직접 작성한 짧은 본문과 눈으로 구분되는 페이지 번호·도형으로 만든다. 기본 세로 텍스트 PDF는 5장, 스캔 PDF는 텍스트 없이 이미지로만 된 5장, 가로 PDF는 3장, 혼합 PDF는 세로·세로·가로·세로·세로 5장으로 준비한다. 별도로 한 장·회전·정사각형을 확인할 작은 파일을 둔다. 한글 본문이 있는 기본 샘플은 사용한 글꼴을 포함한다.

생성된 PDF는 Git으로 추적하고 테스트 때 재생성하지 않는다. 스캔 샘플의 텍스트 부재는 파일 생성 시 검사하며 앱에 텍스트 추출 기능을 추가하지 않는다. E2E에서는 기본 샘플 요청을 `page.route().fulfill({ path })`로 대체해 여러 파일을 읽는다. 사용자용 샘플 전환 UI나 테스트 전용 앱 라우트를 추가하지 않는다. [Playwright 네트워크 모킹](https://playwright.dev/docs/mock)

| 검증               | 범위                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest 순수 함수   | 회전 적용 후 방향, 함께 표시할 페이지, 홀수 마지막 장, 앞뒤 이동, 두 페이지 보기에서 오른쪽 페이지 선택 유지, 잘못된 입력, 너비·수동 배율 경계 |
| Testing Library    | 접근 가능한 이름, Enter 확정, 오류 해제, 보기 선호 복원, 패널 포커스, 로딩·실패·재시도, 새로고침에 대응하는 재마운트                           |
| 비동기 경계 테스트 | 좁은 PDF 모듈 경계의 제어 가능한 Promise로 늦은 응답, 취소, 재시도, unmount 정리 검증. PDF.js 전체 객체를 타입 단언으로 위조하지 않음          |
| Playwright         | 실제 worker와 PDF 렌더링, 파일별 보기·이동, 패널과 실제 폭 변화, 좁은 화면·키보드 흐름, 실패 후 재시도                                         |
| 실제 브라우저 확대 | 브라우저 메뉴에서 200% 확대하고 조작부·포커스·스크롤 확인. viewport 축소나 `deviceScaleFactor`로 대체하지 않음                                 |

E2E는 Canvas 존재만 확인하지 않고 렌더링 완료 상태와 페이지별 고유 도형이 포함된 본문 이미지를 함께 확인한다. 전체 화면 스냅샷을 모든 조건에 만들지 않고, 텍스트·스캔·두 페이지 대표 본문만 이미지 기준으로 검증한다. 외부 UI 폰트에 의존하지 않는 PDF 영역을 기준으로 하며 기준 이미지 변경은 실제 화면을 확인한 뒤 반영한다. [Playwright 시각 비교](https://playwright.dev/docs/test-snapshots)

화면 폭 1023px·1024px 경계로 두 페이지 허용을 검증하고, 읽기 영역 폭이 바뀌어도 허용 여부가 유지되는지 확인한다. E2E에서는 창 크기와 패널 상태로 경계를 만든다. 320px 화면에서는 모든 조작부가 도달 가능한지 확인한다. PDF 로딩 오류는 네트워크 응답 대체로, 개별 render 실패는 제어 가능한 렌더링 경계 테스트로 검증한다.

## 병렬 구현과 완료 확인

PDF 첫 페이지 표시를 공통 기반으로 먼저 완료한다. 이후 페이지 탐색, 한 페이지·두 페이지 보기, 크기 조절, 보조 패널과 반응형 동작은 서로 다른 담당자가 병렬로 구현한다. 각 담당자는 다른 섹션의 미완료 코드를 import하지 않고, 기능 구현과 집중 테스트를 자신의 섹션에 지정된 파일에서 완료한다. 마지막에는 섹션별 화면 연결 작업으로 해당 기능만 공통 기반의 `Reader`에 연결해 개발 서버에서 직접 확인할 수 있게 한다.

1. **페이지 탐색**: 한 페이지 기준 첫·이전·다음·마지막 이동, 현재·전체 페이지 텍스트와 슬라이더를 독립 모듈과 컴포넌트로 구현한 뒤 `Reader` 하단에 연결한다.
2. **한 페이지·두 페이지 보기**: 페이지 방향·배치·두 페이지 이동, 양쪽 페이지 표시 완료 처리를 독립 모듈과 컴포넌트로 구현한 뒤 보기 전환을 `ReaderToolbar`와 본문에 연결한다.
3. **크기 조절**: 높이 맞춤과 수동 배율 계산, 확대·축소·확대율·높이 맞춤 조작을 독립 모듈과 컴포넌트로 구현한 뒤 `ReaderToolbar`와 본문에 연결한다.
4. **보조 패널과 반응형 동작**: 반응형 빈 패널, 화면·읽기 영역 측정, 포커스 복원을 독립 훅과 컴포넌트로 구현한 뒤 `ReaderToolbar`와 Reader 레이아웃에 연결한다.
5. **통합과 전체 독서 흐름 검증**: 페이지 탐색 → 보기 전환 → 크기 조절 → 보조 패널 순서로 화면 연결 변경을 병합하고, 두 공용 조합 파일의 예상 충돌을 공개 props와 순수 함수 계약에 맞춰 해결한다. 기능을 함께 사용한 독서 흐름, 새로고침 초기화, 실제 브라우저 200% 확대와 배포 빌드를 확인한다. 검증에서 발견한 문제를 수정하며 병렬 섹션의 기능 구현을 이 단계로 미루지 않는다.

`tasks.md`의 섹션 1~4는 각각 한 명에게 배정하며 동시에 시작할 수 있다. 담당자는 자신의 섹션 안에서는 작업을 순서대로 진행하고, 실패 확인 → 최소 구현 → 정리 → 화면 연결 순서를 지킨다. 화면 연결 작업에서만 공용 구현 파일인 `reader.tsx`와 `reader-toolbar.tsx`를 수정할 수 있으며, 섹션마다 별도 Reader 연결 테스트 파일을 사용한다. `app.tsx`, 앱 테스트와 전체 E2E는 통합 담당자만 수정한다.

화면 연결은 각 섹션을 완료하고 화면을 확인할 수 없어 추가한 task이다. 해당 섹션에서 완료한 조작만 표시하고 자리 표시자나 다른 섹션의 임시 구현은 추가하지 않는다. 기능 구현 변경과 화면 연결 변경은 별도 커밋으로 남겨 통합 담당자가 연결 변경만 다시 적용하거나 조정할 수 있게 한다. 최종 사용자 흐름과 전체 완료 기준은 네 연결 변경을 순서대로 병합한 통합 단계에서 확인한다.

코드 변경 완료 시 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행한다. PDF worker와 샘플이 프로덕션 번들에서도 제공되는지 `pnpm preview`로 확인한다. 명세의 SC-001~SC-006과 위 검증을 대응시키고 실제 실행 결과를 보고한다. 계획 문서만 작성한 현재 단계에서는 문서 포맷·경로·명세 일치 여부를 검증한다.
