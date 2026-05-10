import { useState } from 'react'
import { useProperty } from '@/hooks/useProperty'
import { RoomDetail, type BookingDetails } from './RoomDetail'
import { Loader2, BedDouble, Users } from 'lucide-react'
import type { Room } from '@/types/database'

interface RoomsProps {
  onSelect: (room: Room) => void
}

// For the Vercel preview domain, fall back to the env var or hardcoded subdomain
function getSubdomain(): string {
  const hostname = window.location.hostname
  // Real production: bleafmudhouse.vattavadastays.com → "bleafmudhouse"
  if (hostname.endsWith('.vattavadastays.com')) {
    return hostname.split('.')[0]
  }
  // Vercel preview or localhost — use env var, else hardcode seed subdomain
  return import.meta.env.VITE_PROPERTY_SUBDOMAIN ?? 'bleafmudhouse'
}

export function Rooms({ onSelect }: RoomsProps) {
  const subdomain = getSubdomain()
  const { data: property, isLoading, error } = useProperty(subdomain)

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-green-700" />
      </div>
    )
  }

  if (error || !property) {
    return (
      <div className="text-center py-16 text-stone-500">
        Unable to load rooms. Please try again later.
      </div>
    )
  }

  const activeRooms = (property.rooms ?? []).filter((r: Room) => r.is_active)

  if (activeRooms.length === 0) {
    return (
      <div className="text-center py-16 text-stone-500">
        No rooms available at this time.
      </div>
    )
  }

  return (
    <section className="py-12 px-4 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-900 mb-8">Our Rooms</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {activeRooms.map((room: Room) => (
          <div
            key={room.id}
            className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSelect(room)}
          >
            {room.images?.[0] && (
              <img
                src={room.images[0]}
                alt={room.name}
                className="h-48 w-full object-cover"
              />
            )}
            <div className="p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-stone-900">{room.name}</h3>
                <p className="text-sm text-stone-500">{room.room_type}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-stone-600">
                <span className="flex items-center gap-1">
                  <BedDouble className="h-4 w-4" />
                  {room.bed_type}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Up to {room.max_guests}
                </span>
              </div>
              {room.room_amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {room.room_amenities.slice(0, 3).map((a) => (
                    <span
                      key={a}
                      className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full"
                    >
                      {a}
                    </span>
                  ))}
                  {room.room_amenities.length > 3 && (
                    <span className="text-xs text-stone-400">
                      +{room.room_amenities.length - 3} more
                    </span>
                  )}
                </div>
              )}
              <div className="pt-1 flex items-center justify-between">
                <span className="font-semibold text-stone-900">
                  ₹{room.base_price.toLocaleString('en-IN')}
                  <span className="text-sm font-normal text-stone-500">/night</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelect(room) }}
                  className="text-sm bg-green-700 text-white px-4 py-1.5 rounded-full hover:bg-green-800 transition-colors"
                >
                  Select
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
