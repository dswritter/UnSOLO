import { getWhatsappAdminData } from '@/actions/admin-whatsapp'
import { WhatsappAdminClient } from './WhatsappAdminClient'

export default async function AdminWhatsappPage() {
  const data = await getWhatsappAdminData()

  if ('error' in data) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">WhatsApp Contacts</h1>
        <p className="text-sm text-red-400">{data.error}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">WhatsApp Contacts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set the WhatsApp number shown on each trip or service listing. Blank uses the platform default.
          Adjust the default in <a className="text-primary hover:underline" href="/admin/settings">Settings → Default WhatsApp number</a>.
        </p>
      </div>
      <WhatsappAdminClient
        platformDefault={data.platformDefault}
        packages={data.packages}
        serviceListings={data.serviceListings}
      />
    </div>
  )
}
