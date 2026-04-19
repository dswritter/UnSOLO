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
      <DropdownMenuContent align="end" className="w-56">
        {/* Trip Option */}
        <DropdownMenuItem onClick={() => router.push('/host/create')} className="flex flex-col items-start cursor-pointer">
          <span className="font-semibold text-sm">Trip</span>
          <span className="text-xs text-muted-foreground">Create a multi-day trip experience</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Services Header */}
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground select-none">Services</div>

        {/* Stays */}
        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=stays')} className="flex flex-col items-start cursor-pointer">
          <span className="font-semibold text-sm">Stays</span>
          <span className="text-xs text-muted-foreground">List a property or room</span>
        </DropdownMenuItem>

        {/* Activities */}
        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=activities')} className="flex flex-col items-start cursor-pointer">
          <span className="font-semibold text-sm">Activities</span>
          <span className="text-xs text-muted-foreground">Host guided tours or experiences</span>
        </DropdownMenuItem>

        {/* Rentals */}
        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=rentals')} className="flex flex-col items-start cursor-pointer">
          <span className="font-semibold text-sm">Rentals</span>
          <span className="text-xs text-muted-foreground">Rent vehicles or equipment</span>
        </DropdownMenuItem>

        {/* Getting Around */}
        <DropdownMenuItem onClick={() => router.push('/host/create-service?type=getting_around')} className="flex flex-col items-start cursor-pointer">
          <span className="font-semibold text-sm">Getting Around</span>
          <span className="text-xs text-muted-foreground">Offer transport services</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
