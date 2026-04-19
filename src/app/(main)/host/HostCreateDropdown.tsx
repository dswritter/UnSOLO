'use client'

import { useRouter } from 'next/navigation'
import { Plus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export function HostCreateDropdown() {
  const router = useRouter()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button className="bg-primary text-primary-foreground font-bold gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Create New
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border">
        <DropdownMenuItem onClick={() => router.push('/host/create')}>
          <div>
            <div className="font-semibold text-sm">Trip</div>
            <div className="text-xs text-muted-foreground">Create a multi-day trip experience</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">Services</div>

        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=stays')}>
          <div>
            <div className="font-semibold text-sm">Stays</div>
            <div className="text-xs text-muted-foreground">List a property or room</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=activities')}>
          <div>
            <div className="font-semibold text-sm">Activities</div>
            <div className="text-xs text-muted-foreground">Host guided tours or experiences</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=rentals')}>
          <div>
            <div className="font-semibold text-sm">Rentals</div>
            <div className="text-xs text-muted-foreground">Rent vehicles or equipment</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=getting_around')}>
          <div>
            <div className="font-semibold text-sm">Getting Around</div>
            <div className="text-xs text-muted-foreground">Offer transport services</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
