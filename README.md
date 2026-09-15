## oh-my-ebook

### 코드 구조

기능 전용 코드는 `src/features/<기능>/`에 모으고, 여러 기능에서 함께 사용하는 코드만 최상위 공통 폴더에 둔다.
아래는 배치 기준이며, 폴더는 실제 코드가 필요할 때 만든다.

```text
src/
├── app.tsx                 # 앱 구성과 기능 연결
├── main.tsx                # React 진입점
├── pages/                  # 라우팅 도입 시 URL별 화면 조합
├── components/             # 서비스 공통 UI
│   └── ui/                 # shadcn 기본 UI
├── features/
│   └── reader/             # 리더 전용 코드
│       ├── components/     # 리더 화면 구성 요소
│       ├── hooks/          # 문서 로딩·읽기 영역 측정
│       └── lib/            # PDF 처리·페이지 탐색 계산
├── hooks/                  # 공통 훅
├── lib/                    # 공통 유틸리티
└── index.css               # Tailwind 설정·공통 테마
```

- 앱·페이지·컴포넌트·훅·유틸리티 파일 이름은 모두 kebab-case로 작성한다. 컴포넌트 함수 이름은 PascalCase를 사용한다.
- shadcn이 아닌 공통 UI는 `components/`의 `ui/` 밖에 두고, 한 기능에서만 사용하는 UI는 해당 기능 안에 둔다.
- 다른 기능에서도 실제로 필요해질 때 공통으로 옮긴다. 공통 코드는 특정 기능에 의존하지 않으며, 기능 간 연결은 앱이나 페이지에서 조합한다.
- 테스트는 대상 파일 옆에 `reader-state.test.ts`, `pdf-viewport.test.tsx`처럼 둔다.

### 테스트

단위·통합 테스트는 기존 Vitest + jsdom + React Testing Library를 사용한다.
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
E2E는 `playwright.config.ts`에서 관리하며 Chromium 한 종류로 시작한다.
첫 테스트는 초기 앱 접속·카운트 변경·새로고침을 검증한다. PDF Reader 구현 시 실제 독서 흐름으로 갱신한다.

`pnpm check`는 기존 품질 검사와 Vitest 테스트를 실행한다. E2E는 `pnpm test:e2e`로 별도 실행하며,
GitHub CI에서는 커버리지 검사 후 Chromium 설치와 E2E를 실행하고 HTML 보고서를 30일간 보관한다.
CI의 첫 실패 재시도에서 trace를 수집한다. 로컬에서 trace가 필요하면 `pnpm test:e2e --trace on`으로 실행한다.
이 E2E는 개발 서버를 대상으로 하며 배포용 빌드 검증은 기존 `pnpm check && pnpm build` 절차를 따른다.

설정 근거: Playwright 공식 [설치](https://playwright.dev/docs/intro),
[서버 실행](https://playwright.dev/docs/test-webserver), [CI](https://playwright.dev/docs/ci-intro) 문서.

### Node.js 버전 설정

Node.js 버전은 [`.nvmrc`](.nvmrc)에 고정해 팀에서 공유한다.
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
