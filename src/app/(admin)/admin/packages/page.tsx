import { getAdminPackages, getDestinations, getIncludesOptions } from '@/actions/admin'
import { PackagesManagementClient } from './PackagesManagementClient'

export default async function AdminPackagesPage() {
  const [packages, destinations, includesOptions] = await Promise.all([
    getAdminPackages(),
    getDestinations(),
    getIncludesOptions(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Packages</h1>
      <PackagesManagementClient
        packages={packages}
        destinations={destinations}
        includesOptions={includesOptions}
      />
    </div>
  )
}
