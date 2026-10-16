import { getAdminPackages, getDestinations, getIncludesOptions } from '@/actions/admin'
import { PackagesManagementClient } from './PackagesManagementClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminPackagesPage() {
  const [packages, destinations, includesOptions] = await Promise.all([
    getAdminPackages(),
    getDestinations(),
    getIncludesOptions(),
  ])

  return (
    <div>
      <AdminPageHeader title="UnSOLO trips" description="Trips run by UnSOLO. Community trips live under Community trips." />
      <PackagesManagementClient
        packages={packages}
        destinations={destinations}
        includesOptions={includesOptions}
      />
    </div>
  )
}
