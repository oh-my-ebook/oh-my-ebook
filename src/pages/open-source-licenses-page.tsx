import { LegalPageLayout } from '@/features/legal/components/legal-page-layout'
import { OpenSourceLicenses } from '@/features/legal/components/open-source-licenses'

export function OpenSourceLicensesPage() {
  return (
    <LegalPageLayout
      description="이 프로젝트가 사용하는 오픈소스 라이브러리와 라이선스 목록입니다."
      title="오픈소스 라이선스"
    >
      <OpenSourceLicenses />
    </LegalPageLayout>
  )
}
