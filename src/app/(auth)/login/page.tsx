import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { LoginV2Form } from '@/components/auth/v2/LoginV2Form'

/** Metrics stream in after the form; force-dynamic avoids build-time service-role queries. */
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <AuthV2Shell mode="login">
      <LoginV2Form />
    </AuthV2Shell>
  )
}
