// Apache-2.0 4(d)에 따라 원저장소의 NOTICE 파일을 그대로 옮긴 것입니다.
// (npm에 배포된 패키지 자체에는 NOTICE 파일이 포함되어 있지 않지만, 원저장소에는 존재합니다.)
export interface PackageNotice {
  packageName: string
  sourceUrl: string
  text: string
}

export const PACKAGE_NOTICES: PackageNotice[] = [
  {
    packageName: 'kiwi-nlp',
    sourceUrl: 'https://github.com/bab2min/Kiwi/blob/main/NOTICE',
    text: `Kiwi — Korean Intelligent Word Identifier
Copyright 2017-2026 Minchul Lee and the Kiwi contributors

This product includes software developed by Minchul Lee (bab2min@gmail.com)
and the Kiwi contributors, licensed under the Apache License, Version 2.0.
See the LICENSE file for the full license text.

Kiwi bundles or links Eigen(MPL-2.0), cpp-btree(Apache-2.0), streamvbyte
(Apache-2.0), cpuinfo(BSD-2-Clause), mimalloc(MIT), JSON for Modern C++(MIT)
and, for command line tools only, TCLAP(MIT). See the source repository's
NOTICE file for each component's full copyright and license text.`,
  },
]
