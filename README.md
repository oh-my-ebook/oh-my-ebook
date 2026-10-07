## oh-my-ebook

### 개발 실행

Node.js 24.21.0과 pnpm 12.4.1을 사용한다. Node.js 버전 전환 방법은 아래 설정 절을 참고한다.

```sh
nvm install
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev`와 `pnpm build`는 실행 전에 `pnpm ocr:prepare`로 OCR·Kiwi 모델과 런타임 자산을 준비한다.
처음 실행하거나 모델 파일이 없으면 외부에서 다운로드하므로 네트워크 연결이 필요하다.
자산만 준비하려면 `pnpm ocr:prepare`를 직접 실행한다.

- `pnpm check`: 포맷·린트·타입·단위 및 통합 테스트 검사
- `pnpm build`: 타입 검사와 프로덕션 빌드, 결과는 `dist/`에 생성
- `pnpm preview`: 빌드 결과를 로컬 서버에서 확인

### 코드 구조

기능 전용 코드는 `src/features/<기능>/`에 모으고, 여러 기능에서 함께 사용하는 코드만 최상위 공통 폴더에 둔다.
아래는 현재 주요 모듈의 구조다. 테스트 파일과 일부 화면·유틸리티는 생략했다.

```text
src/
├── app.tsx                         # 랜딩 라우트·독서 라우트 지연 로딩
├── main.tsx                        # React 진입점
├── pages/                          # 라우팅·기능 화면 조합·저장소 전달
│   ├── reading-routes.tsx          # 서재·리더·콘솔 등의 라우트 구성
│   ├── bookshelf-page.tsx          # 서재 화면과 저장소 연결
│   ├── ebook-reader-page.tsx       # 저장된 책·독서 위치·검색을 리더와 연결
│   ├── reader-page.tsx             # 리더와 채팅 조합
│   └── ocr-console-page.tsx        # OCR 콘솔과 저장소 연결
├── components/                     # 서비스 공통 UI
│   └── ui/                         # shadcn 기본 UI
├── features/
│   ├── bookshelf/
│   │   ├── components/             # 책장·카드·관리 다이얼로그
│   │   ├── hooks/                  # 조회·업로드·표지 재생성·용량 안내
│   │   └── lib/
│   │       ├── bookshelf-store.ts   # 서재에서 사용하는 저장소 인터페이스
│   │       ├── pdf-import.ts        # 책 추가용 메타데이터·표지 생성
│   │       └── analysis/           # 책 분석 실행·중복 실행 제어·검색 청크 생성
│   ├── reader/
│   │   ├── components/             # 본문·툴바·목차·탐색
│   │   ├── hooks/                  # 문서 로딩 상태·독서 세션·읽기 영역 측정
│   │   └── lib/                    # 페이지 배치·탐색·확대율·화면 렌더링
│   ├── chat/
│   │   ├── components/             # 대화·출처·모델 준비 UI
│   │   └── lib/
│   │       ├── rag/                # 책 검색·검색 문맥·출처 처리
│   │       └── web-llm/            # 모델 로딩·응답 처리·WebLLM Worker
│   ├── ocr-console/
│   │   ├── components/             # OCR·검색 데이터 진단 화면
│   │   └── lib/
│   │       └── ocr-console-store.ts # 콘솔 조회용 저장소 인터페이스
│   ├── landing/                    # 서비스 소개·독서 체험
│   └── legal/                      # 개인정보·이용약관·오픈소스 고지
├── hooks/                          # 공통 훅
├── lib/
│   ├── ebook-storage/
│   │   ├── data/
│   │   │   ├── book.ts             # 책 정보·분석 상태·저장 입력·조회 결과 타입
│   │   │   ├── search.ts           # 검색 요청·결과·출처 타입
│   │   │   ├── ocr.ts              # OCR 저장 입력·조회 결과 타입
│   │   │   └── search-index.ts     # 검색 청크·색인 저장 입력·조회 결과 타입
│   │   ├── connection.ts           # 공통 저장소 연결 진입점
│   │   ├── worker-client.ts        # Worker 요청·응답·재시도
│   │   ├── commands.ts             # 저장소 명령과 명령 타입
│   │   ├── worker-messages.ts      # Worker 요청·응답 메시지 타입
│   │   ├── errors.ts               # 공개 오류 코드·메시지·오류 클래스
│   │   ├── browser-storage.ts      # 브라우저 지원 여부·저장소 사용량
│   │   └── worker/
│   │       ├── storage.worker.ts   # 저장소 명령 처리·DB와 PDF 파일 연동
│   │       ├── database.ts         # SQLite 초기화·데이터 조회와 변경
│   │       ├── queries.ts          # 스키마·SQL 쿼리
│   │       ├── pdf-files.ts        # OPFS의 PDF 원본 저장·조회·삭제
│   │       ├── validation.ts       # 요청 데이터 검증
│   │       └── errors.ts           # Worker 내부 오류와 공개 오류 코드 변환
│   ├── pdf/
│   │   ├── document.ts             # 문서·페이지 타입 정의와 좌표 배율
│   │   ├── load-document.ts        # PDF 로딩·취소·자원 정리
│   │   ├── extract-text.ts         # 내장 텍스트 추출과 좌표 변환
│   │   ├── extract-images.ts       # 이미지 영역 추출·병합
│   │   ├── text-layout.ts          # 텍스트 선택 레이어의 글꼴 크기·가로 배율 계산
│   │   ├── errors.ts               # PDF 로딩 오류 분류·변환
│   │   └── ocr/
│   │       ├── recognize-page.ts   # 페이지 OCR 인식·후처리
│   │       └── reading-order.ts    # OCR 결과의 읽기 순서 계산
│   └── kiwi/
│       ├── client.ts               # Kiwi Worker 요청·응답·취소
│       ├── kiwi.worker.ts          # 형태소 분석 모델 실행
│       └── postprocess.ts          # OCR 텍스트 후처리·검색어 추출
└── index.css                       # Tailwind 설정·공통 테마
```

- 앱·페이지·컴포넌트·훅·유틸리티 파일 이름은 모두 kebab-case로 작성한다. 컴포넌트 함수 이름은 PascalCase를 사용한다.
- shadcn이 아닌 공통 UI는 `components/`의 `ui/` 밖에 두고, 한 기능에서만 사용하는 UI는 해당 기능 안에 둔다.
- 기능 전용 코드는 다른 기능에서도 실제로 필요해질 때 공통으로 옮긴다. 공통 코드는 특정 feature를 import하지 않는다.
- feature끼리 내부 컴포넌트·훅·로직을 직접 import하지 않는다. 리더와 채팅 연결처럼 여러 기능이 만나는 부분은 앱이나 페이지에서 조합한다.
- 전자책 저장소는 책 정보·표지·PDF 원본·독서 위치·OCR 결과·검색 색인을 관리한다. 페이지에서 공통 저장소를 전달하고, 서재·리더·콘솔은 필요한 저장소 메서드를 인터페이스로 정의한다.
- 책·검색·OCR 데이터 타입은 `lib/ebook-storage/data/`에 모은다. Worker는 사용하는 모듈에 함께 두며, 저장소·Kiwi Worker는 각 공통 모듈에, WebLLM Worker는 채팅 기능에 둔다.
- 책 추가와 분석 실행 흐름은 `bookshelf`에, 함께 쓰는 PDF·OCR 처리는 `lib/pdf`에 둔다. 텍스트 레이아웃(text layout)은 기존 글자 영역에 맞춰 선택 레이어의 크기·배율을 계산하며, 문서 전체 레이아웃을 재배치하지 않는다.
- 테스트는 대상 파일 옆에 `reader-state.test.ts`, `pdf-viewport.test.tsx`처럼 둔다.

### 테스트

단위·통합 테스트는 Vitest + jsdom + React Testing Library를 사용한다.
실제 앱의 E2E 테스트는 Playwright Test로 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
pnpm test:e2e
```

E2E 실행 시 Playwright가 `http://127.0.0.1:4173`에서 Vite 개발 서버를 자동으로 시작하고
Chromium으로 테스트한다. 로컬에서 같은 주소의 서버가 실행 중이면 재사용하며 CI에서는 새로 시작한다.
브라우저를 업데이트할 때도 `pnpm exec playwright install chromium`을 실행한다.
Linux에서 브라우저 시스템 의존성도 필요하면 `pnpm exec playwright install --with-deps chromium`을 사용한다.

- `pnpm test:e2e:ui`: UI Mode에서 테스트를 실행하고 디버깅한다.
- `pnpm test:e2e --headed`: 브라우저 창을 표시하며 실행한다.
- `pnpm test:e2e:report`: 마지막 HTML 보고서를 연다.

Vitest 테스트는 `src/**/*.test.{ts,tsx}`, E2E 테스트는 `e2e/*.spec.ts`에 둔다.
E2E는 `playwright.config.ts`에서 관리하며 현재 Chromium에서 실행한다.
랜딩 체험, 서재의 책 추가·삭제와 저장 데이터 복원, PDF 표시·탐색·확대, 독서 위치 복원과 채팅 패널 조작을 검증한다.

`pnpm check`는 포맷·린트·타입 검사와 Vitest 테스트를 실행한다. E2E는 `pnpm test:e2e`로 별도 실행하며,
GitHub CI에서는 포맷·린트·타입 검사와 `pnpm test:coverage`를 실행한 뒤 Chromium을 설치하고 E2E를 실행한다. HTML 보고서는 30일간 보관한다.
CI의 첫 실패 재시도에서 trace를 수집한다. 로컬에서 trace가 필요하면 `pnpm test:e2e --trace on`으로 실행한다.
이 E2E는 개발 서버를 대상으로 한다. Vercel 배포는 `vercel.json`에 설정된 `pnpm check && pnpm build`로 검사하고 빌드한다.

설정 근거: Playwright 공식 [설치](https://playwright.dev/docs/intro),
[서버 실행](https://playwright.dev/docs/test-webserver), [CI](https://playwright.dev/docs/ci-intro) 문서.

### Node.js 버전 설정

Node.js 버전은 [`.nvmrc`](.nvmrc)와 [`.node-version`](.node-version)에 24.21.0으로 고정한다.
nvm은 `.nvmrc`를, CI는 `.node-version`을 사용한다. `package.json`의 `devEngines.runtime`도 같은 버전이며, pnpm 버전은 `packageManager`에 12.4.1로 지정한다.
[nvm](https://github.com/nvm-sh/nvm#installing-and-updating)을 설치한 뒤 저장소 루트에서 실행한다.

```sh
nvm install
nvm use
node --version
```

`nvm install`은 `.nvmrc`에 지정된 버전을 설치하고 적용한다. 이후 새 터미널에서 작업하거나
다른 프로젝트에서 돌아오면 `nvm use`로 버전을 적용한다. `.nvmrc`만으로는 폴더 이동 시 자동 전환되지 않는다.

### Node.js 자동 전환 설정 (선택, zsh)

폴더를 이동할 때마다 `nvm use`를 실행하려면 개인 `~/.zshrc`의 **nvm 초기화 코드 아래**에
다음 훅을 한 번 추가한다. `~/.zshrc`는 프로젝트에 커밋하지 않고 팀원마다 설정한다.
이미 nvm 자동 전환 훅을 사용 중이라면 중복으로 추가하지 않는다.

```zsh
autoload -Uz add-zsh-hook

auto_use_project_node() {
  local config_file node_target
  config_file="$(nvm_find_nvmrc)"
  [[ -n "$config_file" ]] || return 0

  node_target="$(nvm version "$(<"$config_file")")"
  if [[ "$node_target" == "N/A" ]]; then
    nvm install
  elif [[ "$(nvm current)" != "$node_target" ]]; then
    nvm use --silent
  fi
}

add-zsh-hook chpwd auto_use_project_node
auto_use_project_node
```

설정을 저장한 뒤 현재 터미널에 적용한다.

```zsh
source ~/.zshrc
```

이 훅은 셸을 시작하거나 폴더를 이동할 때 현재·상위 폴더의 `.nvmrc`를 찾아 버전을 적용한다.
지정된 버전이 없으면 자동으로 설치하며, `.nvmrc`가 없는 폴더에서는 현재 버전을 유지한다.
프로젝트로 이동한 뒤 `node --version`으로 적용된 버전을 확인할 수 있다.

다른 셸을 사용한다면 [nvm의 셸별 자동 전환 예제](https://github.com/nvm-sh/nvm#deeper-shell-integration)를 참고한다.
