import { useProperty } from '@/hooks/useProperty'
import RoomDetail from './RoomDetail'
import { Loader2 } from 'lucide-react'

interface RoomsProps {
  subdomain: string
}

export default function Rooms({ subdomain }: RoomsProps) {
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

  const activeRooms = (property.rooms ?? []).filter((r) => r.is_active)

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
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {activeRooms.map((room) => (
          <RoomDetail key={room.id} room={room} property={property} />
        ))}
      </div>
    </section>
  )
}
