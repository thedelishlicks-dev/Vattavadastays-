import { useMemo } from 'react'
import { format } from 'date-fns'
import { useProperty } from '@/hooks/useProperty'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, BedDouble, Users } from 'lucide-react'
import { getSubdomain } from '@/lib/subdomain'
import type { Room } from '@/types/database'

interface RoomsProps {
  onSelect: (room: Room) => void
  checkIn: Date | null
  checkOut: Date | null
}

export function Rooms({ onSelect, checkIn, checkOut }: RoomsProps) {
  const subdomain = getSubdomain()
  const { data: property, isLoading, error } = useProperty(subdomain)

  const checkInStr = checkIn ? format(checkIn, 'yyyy-MM-dd') : null
  const checkOutStr = checkOut ? format(checkOut, 'yyyy-MM-dd') : null

  const { data: bookedRoomIds = [] } = useQuery({
    queryKey: ['booked-rooms', property?.id, checkInStr, checkOutStr],
    queryFn: async () => {
      if (!property?.id || !checkInStr || !checkOutStr) return []
      const { data, error } = await supabase
        .from('bookings')
        .select('room_id')
        .eq('property_id', property.id)
        .neq('status', 'cancelled')
        .lt('check_in', checkOutStr)
        .gt('check_out', checkInStr)
      if (error) throw error
      return (data ?? []).map((b) => b.room_id)
    },
    enabled: !!property?.id && !!checkInStr && !!checkOutStr,
  })

  const bookedSet = useMemo(() => new Set(bookedRoomIds), [bookedRoomIds])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    <section id="rooms" className="py-12 px-4 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-900 mb-2">Our Rooms</h2>
      {checkInStr && checkOutStr && (
        <p className="text-sm text-stone-500 mb-6">
          Showing availability for {checkInStr} → {checkOutStr}
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {activeRooms.map((room: Room) => {
          const isBooked = bookedSet.has(room.id)
          return (
            <div
              key={room.id}
              className={[
                'rounded-2xl border bg-white overflow-hidden shadow-sm transition-shadow',
                isBooked
                  ? 'opacity-60 cursor-not-allowed border-stone-200'
                  : 'hover:shadow-md cursor-pointer border-stone-200',
              ].join(' ')}
              onClick={() => !isBooked && onSelect(room)}
            >
              {room.images?.[0] && (
                <div className="relative">
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="h-48 w-full object-cover"
                  />
                  {isBooked && (
                    <div className="absolute inset-0 bg-stone-900/40 flex items-center justify-center">
                      <span className="bg-white text-stone-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                        Not available
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!room.images?.[0] && isBooked && (
                <div className="h-12 bg-stone-100 flex items-center justify-center">
                  <span className="text-stone-500 text-xs font-semibold px-3 py-1.5 rounded-full border border-stone-300">
                    Not available
                  </span>
                </div>
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
                        className="text-xs bg-primary-light text-primary px-2 py-0.5 rounded-full"
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
                  {isBooked ? (
                    <span className="text-xs text-stone-400 font-medium">
                      Unavailable
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelect(room) }}
                      className="text-sm bg-primary text-primary-foreground px-4 py-1.5 rounded-full hover:opacity-90 transition-colors"
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
