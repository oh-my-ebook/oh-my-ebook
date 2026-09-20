import { ChevronDownIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OPEN_SOURCE_LICENSES } from '../lib/open-source-license-data'
import { LICENSE_TEXTS } from '../lib/license-texts'
import { PACKAGE_NOTICES } from '../lib/package-notices'

function groupByLicense() {
  const groups = new Map<string, typeof OPEN_SOURCE_LICENSES>()
  for (const entry of OPEN_SOURCE_LICENSES) {
    const group = groups.get(entry.license)
    if (group) {
      group.push(entry)
    } else {
      groups.set(entry.license, [entry])
    }
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
}

export function OpenSourceLicenses() {
  const groups = groupByLicense()

  return (
    <>
      <p>
        oh-my-ebook은 다음 오픈소스 소프트웨어를 사용하고 있습니다. 각 라이브러리의 저작권은 해당
        라이브러리의 원저작자에게 있으며, 표시된 라이선스 조건에 따라 사용합니다. 목록은{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm licenses list --prod</code>로
        생성하고, 저작권 고지는 각 패키지의 LICENSE 파일(없는 경우 소스 코드나 공식 저장소)에서
        확인했습니다.
      </p>

      <div className="flex flex-col gap-3">
        {groups.map(([license, entries]) => (
          <Collapsible key={license} className="rounded-lg border">
            <CollapsibleTrigger className="group/trigger flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium">
              <span>
                {license} <span className="text-muted-foreground">({entries.length}개)</span>
              </span>
              <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-open/trigger:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {LICENSE_TEXTS[license] && (
                <div className="border-t bg-muted/30 px-4 py-3">
                  <p className="mb-2 text-xs font-medium">라이선스 전문</p>
                  <pre className="max-h-64 overflow-y-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                    {LICENSE_TEXTS[license].text}
                  </pre>
                  {LICENSE_TEXTS[license].url && (
                    <a
                      className="mt-2 inline-block text-xs text-primary underline underline-offset-4"
                      href={LICENSE_TEXTS[license].url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      라이선스 공식 문서 보기
                    </a>
                  )}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>오픈소스명</TableHead>
                    <TableHead>버전</TableHead>
                    <TableHead>저작권 고지</TableHead>
                    <TableHead>공식 홈페이지</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.name}>
                      <TableCell className="align-top font-mono text-xs">{entry.name}</TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {entry.version}
                      </TableCell>
                      <TableCell className="align-top text-xs whitespace-pre-line">
                        {entry.copyright ?? (
                          <span className="text-muted-foreground italic">{entry.note}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-xs">
                        {entry.homepage ? (
                          <a
                            className="text-primary underline underline-offset-4"
                            href={entry.homepage}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {entry.homepage.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Apache-2.0 패키지의 NOTICE 고지</h2>
        <p className="text-muted-foreground">
          Apache License 2.0은 원저장소에 NOTICE 파일이 있는 경우 그 내용도 함께 고지하도록
          요구합니다. npm에 배포된 패키지 자체에는 포함되어 있지 않지만, 원저장소를 직접 확인해
          NOTICE가 있는 패키지만 아래에 전문을 옮겼습니다.
        </p>
        {PACKAGE_NOTICES.map((notice) => (
          <div key={notice.packageName} className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="mb-2 font-mono text-xs font-medium">{notice.packageName}</p>
            <pre className="max-h-64 overflow-y-auto font-mono text-xs whitespace-pre-wrap text-muted-foreground">
              {notice.text}
            </pre>
            <a
              className="mt-2 inline-block text-xs text-primary underline underline-offset-4"
              href={notice.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              원문 보기
            </a>
          </div>
        ))}
      </section>
    </>
  )
}
