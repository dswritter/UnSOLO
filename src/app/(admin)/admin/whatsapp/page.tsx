import { getWhatsappAdminData } from '@/actions/admin-whatsapp'
import { WhatsappAdminClient } from './WhatsappAdminClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminWhatsappPage() {
  const data = await getWhatsappAdminData()

  if ('error' in data) {
    return (
      <div className="p-6">
        <AdminPageHeader title="WhatsApp" />
        <p className="text-sm text-red-400">{data.error}</p>
      </div>
    )
  }

  return (
    <div>
      <AdminPageHeader title="WhatsApp" description={<>
          Set the WhatsApp number shown on each trip or service listing. Blank uses the platform default.
          Adjust the default in <a className="text-primary hover:underline" href="/admin/settings">Settings → Default WhatsApp number</a>.
        </>} />
      <WhatsappAdminClient
        platformDefault={data.platformDefault}
        packages={data.packages}
        serviceListings={data.serviceListings}
      />
    </div>
  )
}
