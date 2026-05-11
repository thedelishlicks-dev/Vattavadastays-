import { createFileRoute } from '@tanstack/react-router'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { Loader2, BedDouble } from 'lucide-react'

export const Route = createFileRoute('/admin/rooms')({
  component: AdminRooms,
})

function AdminRooms() {
  const { data: property, isLoading, error } = useOwnerProperty()

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
        Could not load property data.
      </div>
    )
  }

  const rooms = property.rooms ?? []

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Rooms</h1>

      {rooms.length === 0 ? (
        <p className="text-stone-500">No rooms found for your property.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-3">
                <BedDouble className="h-5 w-5 text-green-700" />
                <h2 className="font-semibold text-stone-900">{room.name}</h2>
                <span
                  className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                    room.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {room.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="text-sm text-stone-600 space-y-1">
                <p>Type: <span className="font-medium">{room.room_type}</span></p>
                <p>Max guests: <span className="font-medium">{room.max_guests}</span></p>
                <p>Bed: <span className="font-medium">{room.bed_type}</span></p>
                <p>
                  Base price:{' '}
                  <span className="font-medium">₹{room.base_price}/night</span>
                </p>
                {room.extra_guest_price > 0 && (
                  <p>
                    Extra guest:{' '}
                    <span className="font-medium">₹{room.extra_guest_price}/person</span>
                  </p>
                )}
              </div>
              {room.room_amenities && room.room_amenities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {room.room_amenities.map((a) => (
                    <span
                      key={a}
                      className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
