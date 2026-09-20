import { LegalPageLayout } from '@/features/legal/components/legal-page-layout'
import { TermsOfService } from '@/features/legal/components/terms-of-service'

export function TermsOfServicePage() {
  return (
    <LegalPageLayout title="이용약관">
      <TermsOfService />
    </LegalPageLayout>
  )
}
