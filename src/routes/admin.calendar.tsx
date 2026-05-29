import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { useAvailabilityRange } from '@/hooks/useAvailabilityRange'
import { useBookings } from '@/hooks/useBookings'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

export const Route = createFileRoute('/admin/calendar')({
  component: AdminCalendar,
})

function AdminCalendar() {
  const { data: property, isLoading: propLoading } = useOwnerProperty()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(new Date())

  const rooms = property?.rooms ?? []
  const activeRoomId = selectedRoomId ?? rooms[0]?.id ?? null

  const startDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    .toISOString()
    .split('T')[0]
  const endDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 2, 0)
    .toISOString()
    .split('T')[0]

  const { data: availability, isLoading: availLoading } = useAvailabilityRange(
    activeRoomId ?? '',
    startDate,
    endDate
  )

  const { data: bookings = [], isLoading: bookingsLoading } = useBookings(
    property?.id ?? ''
  )

  // Build a set of booked dates for the selected room
  const bookedDates = useMemo(() => {
    const dates = new Set<string>()
    bookings
      .filter(
        (b) =>
          b.room_id === activeRoomId &&
          b.status !== 'cancelled'
      )
      .forEach((b) => {
        const start = new Date(b.check_in)
        const end = new Date(b.check_out)
        const cur = new Date(start)
        while (cur < end) {
          dates.add(cur.toISOString().split('T')[0])
          cur.setDate(cur.getDate() + 1)
        }
      })
    return dates
  }, [bookings, activeRoomId])

  // Build a map of guest names per date for tooltip
  const bookedGuestMap = useMemo(() => {
    const map: Record<string, string> = {}
    bookings
      .filter(
        (b) =>
          b.room_id === activeRoomId &&
          b.status !== 'cancelled'
      )
      .forEach((b) => {
        const start = new Date(b.check_in)
        const end = new Date(b.check_out)
        const cur = new Date(start)
        while (cur < end) {
          const d = cur.toISOString().split('T')[0]
          map[d] = b.guest_name
          cur.setDate(cur.getDate() + 1)
        }
      })
    return map
  }, [bookings, activeRoomId])

  if (propLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const monthLabel = viewDate.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })

  const isLoading = availLoading || bookingsLoading

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="font-display text-2xl md:text-3xl font-semibold mb-6">Availability Calendar</h1>

      <p className="text-xs text-muted-foreground mb-3">
        To block dates, use the Block dates button on the Dashboard.
      </p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeRoomId === room.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:border-primary'
            }`}
          >
            {room.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-stone-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-foreground">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-stone-100">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16 border-b border-r border-border/50" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const slot = availMap[dateStr]
              const isBooked = bookedDates.has(dateStr)
              const guestName = bookedGuestMap[dateStr]
              const isManuallyBlocked = slot?.is_available === false
              const price = slot?.price_override

              const bgColor = isBooked
                ? 'bg-blue-50'
                : isManuallyBlocked
                ? 'bg-red-50'
                : 'bg-green-50'

              const statusLabel = isBooked
                ? 'Booked'
                : isManuallyBlocked
                ? 'Closed'
                : 'Open'

              const statusColor = isBooked
                ? 'text-blue-600'
                : isManuallyBlocked
                ? 'text-red-500'
                : 'text-green-700'

              return (
                <div
                  key={dateStr}
                  className={`h-16 border-b border-r border-border/50 p-1.5 text-xs ${bgColor}`}
                  title={guestName ? `${guestName}` : undefined}
                >
                  <div className="font-medium text-foreground">{day}</div>
                  <div className={`mt-0.5 truncate ${statusColor}`}>
                    {statusLabel}
                  </div>
                  {guestName && (
                    <div className="text-blue-500 truncate text-[10px]">
                      {guestName.split(' ')[0]}
                    </div>
                  )}
                  {price && !isBooked && (
                    <div className="text-amber-600">₹{price}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" />
          Blocked
        </span>
      </div>
    </div>
  )
}
