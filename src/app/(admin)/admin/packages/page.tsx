import { getAdminPackages, getDestinations } from '@/actions/admin'
import { PackagesManagementClient } from './PackagesManagementClient'

export default async function AdminPackagesPage() {
  const [packages, destinations] = await Promise.all([
    getAdminPackages(),
    getDestinations(),
  ])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Packages</h1>
      <PackagesManagementClient packages={packages} destinations={destinations} />
    </div>
  )
}
