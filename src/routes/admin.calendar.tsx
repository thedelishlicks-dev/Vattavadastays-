import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { useAvailability } from '@/hooks/useAvailability'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/admin/calendar')({
  component: AdminCalendar,
})

function AdminCalendar() {
  const { data: property, isLoading: propLoading } = useOwnerProperty()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(new Date())

  // pick first room by default once loaded
  const rooms = property?.rooms ?? []
  const activeRoomId = selectedRoomId ?? rooms[0]?.id ?? null

  // build date range: start of current month → +60 days
  const startDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const endDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 2, 0)
    .toISOString()
    .split('T')[0]

  const { data: availability, isLoading: availLoading } = useAvailability(
    activeRoomId ?? '',
    startDate,
    endDate
  )

  if (propLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-green-700" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-16 text-stone-500">
        Could not load property data.
      </div>
    )
  }

  // Build calendar days for the current month
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const availMap: Record<string, { is_available: boolean; price_override: number | null }> = {}
  if (availability) {
    for (const slot of availability) {
      availMap[slot.date] = {
        is_available: slot.is_available,
        price_override: slot.price_override,
      }
    }
  }

  const prevMonth = () =>
    setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () =>
    setViewDate(new Date(year, month + 1, 1))

  const monthLabel = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Availability Calendar</h1>

      {/* Room selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeRoomId === room.id
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-stone-700 border-stone-300 hover:border-green-600'
            }`}
          >
            {room.name}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-stone-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-stone-900">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-stone-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grid */}
      {availLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-green-700" />
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 overflow-hidden bg-white">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-stone-50 border-b border-stone-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-medium text-stone-500"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before month start */}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16 border-b border-r border-stone-100" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const slot = availMap[dateStr]
              const isAvailable = slot?.is_available ?? true
              const price = slot?.price_override

              return (
                <div
                  key={dateStr}
                  className={`h-16 border-b border-r border-stone-100 p-1.5 text-xs ${
                    isAvailable ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  <div className="font-medium text-stone-700">{day}</div>
                  <div
                    className={`mt-0.5 ${
                      isAvailable ? 'text-green-700' : 'text-red-500'
                    }`}
                  >
                    {isAvailable ? 'Open' : 'Closed'}
                  </div>
                  {price && (
                    <div className="text-amber-600">₹{price}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-sm text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" />
          Unavailable
        </span>
      </div>
    </div>
  )
}
