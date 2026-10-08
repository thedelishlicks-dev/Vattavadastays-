import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { useBookings } from '@/hooks/useBookings'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Ban, AlertTriangle, Loader2, X } from 'lucide-react'
import { BlockDatesModal } from '@/components/BlockDatesModal'
import { buildCalendarIndex, stateOf as stateOfIdx, summarizeDate, type DayState } from '@/lib/calendarState'

export const Route = createFileRoute('/admin/calendar')({
  component: AdminCalendar,
})

// ---------------------------------------------------------------------------
// Owner calendar
//
// Every date of every room gets exactly ONE of five states, decided here from
// two sources:
//   bookings     → who is actually staying (nights = check-in … day BEFORE check-out)
//   availability → rows with is_available=false (written by bookings AND by manual blocks)
//
//   Booked    a confirmed/completed booking occupies the night
//   Pending   a guest request / hold that isn't confirmed yet
//   Check-out the day a guest leaves: availability may say "unavailable" but
//             it is the booking's own departure day, NOT a manual block
//   Blocked   unavailable with no booking behind it = closed by the owner
//   Open      free
//
// The old calendar called anything unavailable-but-not-booked "Closed", which
// also caught check-out days and anything it couldn't match to a booking.
// "All rooms" view summarises a date across rooms: "N free", "Full" (every
// room taken) or "Blocked" (every room closed by the owner).
// ---------------------------------------------------------------------------

const ALL = 'all'
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

const CELL: Record<DayState, { bg: string; text: string; label: string; short?: string }> = {
  open: { bg: 'bg-green-50', text: 'text-green-700', label: 'Open' },
  booked: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Booked' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
  checkout: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'Check-out', short: 'Out' },
  blocked: { bg: 'bg-red-50', text: 'text-red-500', label: 'Blocked' },
}

function CalendarSkeleton() {
  return (
    <div className="animate-in fade-in duration-300 rounded-xl border border-border overflow-hidden">
      <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-8" />
        ))}
      </div>
      <div className="grid grid-cols-7">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="h-16 border-b border-r border-border/50 p-1.5">
            <div className="h-3 w-4 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day detail for the "All rooms" view. A cell can only say "1 free"; this shows
// what each room is doing that day (tooltips don't exist on iPad/phone) and lets
// the owner reopen a blocked room straight from here.
// ---------------------------------------------------------------------------
function DayDialog({
  date,
  rooms,
  onClose,
  onReopen,
}: {
  date: string
  rooms: { id: string; name: string; state: DayState; guest?: string }[]
  onClose: () => void
  onReopen: (roomId: string) => void
}) {
  const pretty = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-xl p-5 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold">{pretty}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rooms.map((r) => {
            const c = CELL[r.state]
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  {r.guest && <p className="text-xs text-muted-foreground truncate">{r.guest}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>
                  {r.state === 'blocked' && (
                    <button
                      onClick={() => onReopen(r.id)}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <button onClick={onClose} className="w-full rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reopen a blocked date. The app could block dates but never unblock them, so a
// mistaken block (or a leftover from a cancelled pending booking) stayed
// "Blocked" forever. Only dates the calendar shows as Blocked (= no booking
// behind them) can be reopened here, so a real booking can never be freed by
// accident.
// ---------------------------------------------------------------------------
function ReopenDialog({
  roomId,
  roomName,
  date,
  note,
  onClose,
  onDone,
}: {
  roomId: string
  roomName: string
  date: string
  note: string | null
  onClose: () => void
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pretty = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const handleReopen = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('availability')
      .update({ is_available: true, note: null })
      .eq('room_id', roomId)
      .eq('date', date)
    setSaving(false)
    if (err) {
      setError(err.message || 'Could not reopen this date — please try again.')
      return
    }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-xl p-5 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Reopen this date?</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {roomName} · {pretty}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {note && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Reason you gave: </span>
            {note}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          This makes the date available for bookings again (on your guest page too). It doesn&apos;t touch any booking.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleReopen}
            disabled={saving}
            className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Reopen date
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminCalendar() {
  const { data: property, isLoading: propLoading } = useOwnerProperty()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState(new Date())
  const [showBlock, setShowBlock] = useState(false)
  const [reopen, setReopen] = useState<{ roomId: string; roomName: string; date: string; note: string | null } | null>(null)
  const [dayDetail, setDayDetail] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const rooms = property?.rooms ?? []
  const activeRooms = rooms.filter((r: { is_active: boolean }) => r.is_active)
  // With more than one room the default is the "All rooms" overview.
  const view = selectedRoomId ?? (rooms.length > 1 ? ALL : (rooms[0]?.id ?? null))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  // Built from local parts — NOT toISOString(), which in India (UTC+5:30)
  // shifts local midnight back a day and silently dropped the month's last day.
  const startDate = ymd(year, month, 1)
  const endDate = ymd(year, month, daysInMonth)

  const roomIds = rooms.map((r: { id: string }) => r.id)
  const roomIdsKey = roomIds.join(',')

  // One query for every room's unavailable dates this month.
  // Key starts with "availability-range" so BlockDatesModal's invalidation refreshes it.
  const {
    data: availRows = [],
    isLoading: availLoading,
    isError: availError,
  } = useQuery({
    queryKey: ['availability-range', 'calendar', roomIdsKey, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availability')
        .select('room_id, date, is_available, note')
        .in('room_id', roomIds)
        .eq('is_available', false)
        .gte('date', startDate)
        .lte('date', endDate)
      if (error) throw error
      return data ?? []
    },
    enabled: roomIds.length > 0,
  })

  const {
    data: bookings = [],
    isLoading: bookingsLoading,
    isError: bookingsError,
  } = useBookings(property?.id ?? '', {
    // Only this month's stays (a stay that straddles the month edge still
    // overlaps it) — not the property's entire history. No charges needed.
    overlapFrom: startDate,
    overlapTo: endDate,
    withCharges: false,
  })

  // Pure logic lives in src/lib/calendarState.ts (and is unit-tested there).
  const index = useMemo(
    () => buildCalendarIndex(bookings, availRows as { room_id: string; date: string }[]),
    [bookings, availRows],
  )
  const stateOf = (roomId: string, date: string) => stateOfIdx(index, roomId, date)

  if (propLoading) {
    return (
      <div className="animate-in fade-in duration-300 max-w-4xl mx-auto py-8 px-4">
        <div className="h-8 w-64 rounded-md bg-muted animate-pulse mb-6" />
        <div className="flex gap-2 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
        <CalendarSkeleton />
      </div>
    )
  }

  if (!property) {
    return <div className="text-center py-16 text-stone-500">Could not load property data.</div>
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const monthLabel = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  const isLoading = availLoading || bookingsLoading
  const isAll = view === ALL

  // "All rooms" cell: summarise a date across every active room.
  const summarize = (date: string) => {
    const r = summarizeDate(index, activeRooms, date)
    const title = r.lines.join('\n')
    // say WHAT is taken, in colour — "1 free" alone doesn't tell you a room is blocked
    const parts: { text: string; cls: string }[] = []
    if (r.booked > 0) parts.push({ text: `${r.booked} booked`, cls: 'text-blue-600' })
    if (r.pending > 0) parts.push({ text: `${r.pending} pending`, cls: 'text-amber-700 font-medium' })
    if (r.leaving > 0) parts.push({ text: `${r.leaving} check-out`, cls: 'text-sky-700' })
    if (r.blocked > 0) parts.push({ text: `${r.blocked} blocked`, cls: 'text-red-500 font-medium' })
    switch (r.kind) {
      case 'none':
        return { label: '', parts, bg: 'bg-muted/30', text: 'text-muted-foreground', title }
      case 'open':
        return { label: 'Open', parts: [{ text: 'all free', cls: 'text-muted-foreground' }], bg: 'bg-green-50', text: 'text-green-700', title }
      case 'some-free':
        return { label: `${r.free} free`, parts, bg: 'bg-green-50', text: 'text-green-700', title }
      case 'blocked':
        return { label: 'Blocked', parts: [{ text: 'all rooms', cls: 'text-muted-foreground' }], bg: 'bg-red-50', text: 'text-red-500', title }
      case 'checkout':
        return { label: 'Check-out', parts, bg: 'bg-sky-50', text: 'text-sky-700', title }
      default:
        return { label: 'Full', parts, bg: 'bg-blue-100', text: 'text-blue-700', title }
    }
  }

  return (
    <div
      key="calendar-content"
      className="animate-in fade-in slide-in-from-bottom-1 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)] max-w-4xl mx-auto py-8 px-4"
    >
      <div className="flex items-start justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-semibold">Calendar</h1>
        <button
          type="button"
          onClick={() => setShowBlock(true)}
          disabled={activeRooms.length === 0}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Ban className="h-4 w-4" /> Block dates
        </button>
      </div>

      {(bookingsError || availError) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Couldn&apos;t load {bookingsError ? 'your bookings' : 'availability'} — booked dates may show wrongly (as Blocked or Open)
            until this reloads. Check your connection and refresh. If you opened this through Superadmin, log in as the property
            owner to see bookings.
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {rooms.length > 1 && (
          <button
            onClick={() => setSelectedRoomId(ALL)}
            className={`press-scale px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] ${
              isAll
                ? 'bg-primary text-primary-foreground border-primary shadow-[var(--shadow-neu-flat)]'
                : 'bg-background text-foreground border-border hover:border-primary'
            }`}
          >
            All rooms
          </button>
        )}
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setSelectedRoomId(room.id)}
            className={`press-scale px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] ${
              view === room.id
                ? 'bg-primary text-primary-foreground border-primary shadow-[var(--shadow-neu-flat)]'
                : 'bg-background text-foreground border-border hover:border-primary'
            }`}
          >
            {room.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="press-scale p-2 rounded-lg hover:bg-stone-100 transition-colors" aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-foreground">{monthLabel}</span>
        <button onClick={nextMonth} className="press-scale p-2 rounded-lg hover:bg-stone-100 transition-colors" aria-label="Next month">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Add a room first (Rooms &amp; Pricing) — then your bookings and blocked dates will show here.
        </div>
      ) : isLoading ? (
        <CalendarSkeleton />
      ) : (
        <div
          key={view ?? 'none'}
          className="animate-in fade-in duration-[var(--duration-base)] ease-[var(--ease-smooth)] rounded-xl border border-border overflow-hidden bg-card shadow-[var(--shadow-neu-flat)]"
        >
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
              const dateStr = ymd(year, month, day)

              if (isAll) {
                const s = summarize(dateStr)
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setDayDetail(dateStr)}
                    className={`h-16 border-b border-r border-border/50 p-1.5 text-xs text-left w-full cursor-pointer hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${s.bg}`}
                    title={s.title || undefined}
                  >
                    <div className="font-medium text-foreground">{day}</div>
                    <div className={`mt-0.5 truncate font-medium ${s.text}`}>{s.label}</div>
                    <div className="truncate text-[10px] leading-tight">
                      {s.parts.map((p, i) => (
                        <span key={p.text} className={p.cls}>
                          {i > 0 ? ' · ' : ''}
                          {p.text}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              }

              const info = stateOf(view as string, dateStr)
              const c = CELL[info.state]
              const firstName = info.name ? info.name.split(' ')[0] : ''
              const hint =
                info.state === 'open' && firstName ? `Out: ${firstName}` : info.state === 'blocked' ? 'Tap to reopen' : info.state === 'open' ? '' : firstName
              if (info.state === 'blocked') {
                const noteText = (availRows as { room_id: string; date: string; note?: string | null }[]).find((r) => r.room_id === view && String(r.date).slice(0, 10) === dateStr)?.note ?? null
                const roomName = rooms.find((r: { id: string }) => r.id === view)?.name ?? 'Room'
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setReopen({ roomId: view as string, roomName, date: dateStr, note: noteText })}
                    className={`h-16 border-b border-r border-border/50 p-1.5 text-xs text-left w-full cursor-pointer hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${c.bg}`}
                    title={noteText ? `Blocked — ${noteText}. Tap to reopen.` : 'Blocked. Tap to reopen.'}
                  >
                    <div className="font-medium text-foreground">{day}</div>
                    <div className={`mt-0.5 truncate ${c.text}`}>{c.label}</div>
                    <div className="text-muted-foreground truncate text-[10px]">{hint}</div>
                  </button>
                )
              }
              return (
                <div
                  key={dateStr}
                  className={`h-16 border-b border-r border-border/50 p-1.5 text-xs ${c.bg}`}
                  title={info.name ? `${c.label} — ${info.name}` : c.label}
                >
                  <div className="font-medium text-foreground">{day}</div>
                  <div className={`mt-0.5 truncate ${c.text}`}>
                    {c.short ? (
                      <>
                        <span className="hidden sm:inline">{c.label}</span>
                        <span className="sm:hidden">{c.short}</span>
                      </>
                    ) : (
                      c.label
                    )}
                  </div>
                  {hint && <div className="text-muted-foreground truncate text-[10px]">{hint}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {isAll ? <>Tap any date to see each room. Pick a room above to see its bookings.</> : <>Tap a <strong>Blocked</strong> date to reopen it.</>}
      </p>

      <div className="flex gap-x-4 gap-y-2 mt-4 text-sm text-muted-foreground flex-wrap">
        {(isAll
          ? [
              ['bg-green-100 border-green-300', 'Free rooms'],
              ['bg-blue-200 border-blue-300', 'Full'],
              ['bg-red-100 border-red-300', 'Blocked'],
            ]
          : [
              ['bg-green-100 border-green-300', 'Open'],
              ['bg-blue-100 border-blue-300', 'Booked'],
              ['bg-amber-100 border-amber-300', 'Pending'],
              ['bg-sky-100 border-sky-300', 'Check-out day'],
              ['bg-red-100 border-red-300', 'Blocked'],
            ]
        ).map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm border ${cls}`} />
            {label}
          </span>
        ))}
      </div>

      {dayDetail && (
        <DayDialog
          date={dayDetail}
          rooms={summarizeDate(index, activeRooms, dayDetail).rooms}
          onClose={() => setDayDetail(null)}
          onReopen={(roomId) => {
            const room = activeRooms.find((r: { id: string }) => r.id === roomId)
            const noteText =
              (availRows as { room_id: string; date: string; note?: string | null }[]).find(
                (r) => r.room_id === roomId && String(r.date).slice(0, 10) === dayDetail,
              )?.note ?? null
            setReopen({ roomId, roomName: room?.name ?? 'Room', date: dayDetail, note: noteText })
            setDayDetail(null)
          }}
        />
      )}

      {reopen && (
        <ReopenDialog
          roomId={reopen.roomId}
          roomName={reopen.roomName}
          date={reopen.date}
          note={reopen.note}
          onClose={() => setReopen(null)}
          onDone={() => {
            // same refresh set as BlockDatesModal: owner calendar + guest date picker
            queryClient.invalidateQueries({ queryKey: ['availability-range'], exact: false })
            queryClient.invalidateQueries({ queryKey: ['blocked-dates'], exact: false })
            queryClient.invalidateQueries({ queryKey: ['guest-bookings'], exact: false })
            setReopen(null)
          }}
        />
      )}

      {showBlock && (
        <BlockDatesModal
          propertyId={property.id}
          rooms={activeRooms}
          property={property}
          onClose={() => setShowBlock(false)}
        />
      )}
    </div>
  )
}
