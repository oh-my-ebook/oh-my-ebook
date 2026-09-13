## oh-my-ebook

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
