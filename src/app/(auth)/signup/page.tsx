import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { SignupV2Form } from '@/components/auth/v2/SignupV2Form'

/** Metrics stream in after the form; force-dynamic avoids build-time service-role queries. */
export const dynamic = 'force-dynamic'

export default function SignupPage() {
  return (
    <AuthV2Shell mode="signup">
      <SignupV2Form />
    </AuthV2Shell>
  )
}
