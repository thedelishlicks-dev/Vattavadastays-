import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { useBookings } from '@/hooks/useBookings'
import { supabase } from '@/lib/supabase'
import { CalendarDays, ChevronLeft, ChevronRight, Ban, AlertTriangle, Loader2, X, Link2, Phone, MessageCircle, ExternalLink } from 'lucide-react'
import { BlockDatesModal } from '@/components/BlockDatesModal'
import { ChannelSyncModal } from '@/components/ChannelSyncModal'
import { useIcalAutoSync } from '@/hooks/useIcalFeeds'
import { friendlyNote, isIcalNote } from '@/lib/icalClient'
import { CHANNEL_SYNC_ENABLED } from '@/lib/features'
import { buildCalendarIndex, stateOf as stateOfIdx, summarizeDate, bookingForCell, type CalBookingRef, type DayState, type DaySummary, type RoomDay } from '@/lib/calendarState'
import { waDigits } from '@/lib/phone'

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

// ---------------------------------------------------------------------------
// Phone-friendly "All rooms" cells.
// Seven columns on a phone leave ~47 px per day: too narrow for words. So each
// day shows one dot per room (colour AND shape: free is a hollow ring, the rest
// are solid), and the words live in the day panel under the grid. Properties
// with more rooms than DOT_MAX (tents, houseboats...) show "N free" plus a thin
// stacked bar instead, because 15-20 dots would not fit a cell.
// ---------------------------------------------------------------------------
const DOT_MAX = 6
const todayYmd = () => {
  const t = new Date()
  return ymd(t.getFullYear(), t.getMonth(), t.getDate())
}

const DOT: Record<DayState, string> = {
  open: 'border-[1.5px] border-green-600 bg-transparent',
  booked: 'bg-blue-500',
  pending: 'bg-amber-500',
  checkout: 'border-[1.5px] border-sky-500 bg-sky-200',
  blocked: 'bg-red-500',
}

const LEGEND_LABEL: Record<DayState, string> = {
  open: 'Free',
  booked: 'Booked',
  pending: 'Pending',
  checkout: 'Check-out day',
  blocked: 'Blocked',
}

// Single-room view: stays are drawn as bars (see the cell code below).
type BarKind = 'booked' | 'pending' | 'blocked'
const BAR: Record<BarKind, string> = {
  booked: 'bg-blue-200 text-blue-900',
  pending: 'bg-amber-200 text-amber-900',
  blocked: 'bg-red-200 text-red-900',
}

function Dot({ state }: { state: DayState }) {
  return <span className={`block h-[9px] w-[9px] shrink-0 rounded-full ${DOT[state]}`} aria-hidden="true" />
}

function RoomDots({ rooms }: { rooms: RoomDay[] }) {
  const cols = Math.min(rooms.length, 3)
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 9px)` }}>
      {rooms.map((r) => (
        <Dot key={r.id} state={r.state} />
      ))}
    </div>
  )
}

function OccupancyBar({ s }: { s: DaySummary }) {
  const parts: [number, string][] = [
    [s.booked, 'bg-blue-500'],
    [s.pending, 'bg-amber-500'],
    [s.leaving, 'bg-sky-400'],
    [s.blocked, 'bg-red-500'],
    [s.free, 'bg-green-300'],
  ]
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {parts.map(([n, cls], i) =>
        n > 0 ? <span key={i} className={cls} style={{ width: `${(n / s.total) * 100}%` }} /> : null,
      )}
    </div>
  )
}

function DayNum({ day, isToday }: { day: number; isToday: boolean }) {
  return (
    <span
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full text-xs font-medium ${
        isToday ? 'bg-[var(--section)] text-[var(--section-on)]' : 'text-foreground'
      }`}
    >
      {day}
    </span>
  )
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
// A booked / pending / check-out cell, tapped: who is it, and a way into the booking.
// (These cells used to be dead — the owner had to search the Bookings page by hand.)
// ---------------------------------------------------------------------------
type PeekBooking = CalBookingRef & {
  guest_phone?: string | null
  guest_count?: number | null
  total_amount?: number | string | null
}

function BookingPeek({
  booking,
  roomName,
  date,
  state,
  nightClosed,
  onClose,
  onReopen,
}: {
  booking: PeekBooking
  roomName: string
  date: string
  state: DayState
  /** On a check-out day: that night is also marked unavailable (the owner may have closed it). */
  nightClosed: boolean
  onClose: () => void
  onReopen: () => void
}) {
  const nights = Math.max(
    1,
    Math.round((Date.parse(`${String(booking.check_out).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(booking.check_in).slice(0, 10)}T00:00:00Z`)) / 86400000),
  )
  const pretty = (d: string) =>
    new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  // Keep ?property= (used when a platform admin views a property), as the dashboard's links do.
  const prop = new URLSearchParams(window.location.search).get('property')
  const href = `/admin/bookings?${prop ? `property=${encodeURIComponent(prop)}&` : ''}${booking.group_id ? 'groupId' : 'bookingId'}=${booking.group_id ?? booking.id}`
  const phone = booking.guest_phone ?? ''
  const wa = waDigits(phone)
  const total = Number(booking.total_amount ?? 0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-card rounded-2xl shadow-xl p-5 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{booking.guest_name}</h2>
            <p className="text-xs text-muted-foreground">
              {roomName} · {state === 'checkout' ? `checks out ${pretty(date)}` : pretty(date)}
            </p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="rounded-xl border border-border divide-y divide-border text-sm">
          <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{booking.status}</dd></div>
          <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Stay</dt><dd className="font-medium">{pretty(booking.check_in)} → {pretty(booking.check_out)} ({nights} night{nights > 1 ? 's' : ''})</dd></div>
          {booking.guest_count ? <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Guests</dt><dd className="font-medium">{booking.guest_count}</dd></div> : null}
          {total > 0 && <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Room total</dt><dd className="font-medium">₹{total.toLocaleString('en-IN')}</dd></div>}
        </dl>

        {phone && (
          <div className="flex gap-2">
            <a href={`tel:+${wa}`} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium hover:bg-muted">
              <Phone className="h-4 w-4" /> Call
            </a>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium hover:bg-muted">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        )}

        {state === 'checkout' && nightClosed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
            <p>The night starting this day is also marked unavailable. If you closed it yourself, you can reopen it — the guest's stay is not affected.</p>
            <button onClick={onReopen} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium hover:bg-amber-100">
              Reopen this night
            </button>
          </div>
        )}

        <a href={href} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90">
          <ExternalLink className="h-4 w-4" /> Open booking
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day detail for the "All rooms" view. A cell can only say "1 free"; this shows
// what each room is doing that day (tooltips don't exist on iPad/phone) and lets
// the owner reopen a blocked room straight from here.
// ---------------------------------------------------------------------------
const STATE_ORDER: DayState[] = ['pending', 'booked', 'checkout', 'blocked']

function RoomRow({
  r,
  onReopen,
  onView,
}: {
  r: RoomDay
  onReopen: (roomId: string) => void
  onView: (roomId: string, state: DayState) => void
}) {
  const c = CELL[r.state]
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-3">
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
        {(r.state === 'booked' || r.state === 'pending' || r.state === 'checkout') && (
          <button
            onClick={() => onView(r.id, r.state)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            View
          </button>
        )}
      </div>
    </li>
  )
}

// The tapped day, in the page (not a pop-up), so the owner can tap through days.
// With many rooms (tents, houseboats) rooms that need attention are listed first
// and the free ones are folded into one line.
function DayPanel({
  date,
  rooms,
  onReopen,
  onView,
  innerRef,
}: {
  date: string
  rooms: RoomDay[]
  onReopen: (roomId: string) => void
  onView: (roomId: string, state: DayState) => void
  innerRef: React.Ref<HTMLDivElement>
}) {
  const pretty = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const many = rooms.length > 8
  const count = (st: DayState) => rooms.filter((r) => r.state === st).length
  const free = rooms.filter((r) => r.state === 'open')
  const listed = many ? STATE_ORDER.flatMap((st) => rooms.filter((r) => r.state === st)) : rooms
  const summary = [
    `${free.length} free`,
    count('booked') > 0 && `${count('booked')} booked`,
    count('pending') > 0 && `${count('pending')} pending`,
    count('checkout') > 0 && `${count('checkout')} check-out`,
    count('blocked') > 0 && `${count('blocked')} blocked`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div ref={innerRef} className="mt-4 rounded-xl border border-border bg-card p-4 space-y-3 scroll-mb-24">
      <div>
        <h2 className="font-semibold">{pretty}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
      </div>
      {listed.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {listed.map((r) => (
            <RoomRow key={r.id} r={r} onReopen={onReopen} onView={onView} />
          ))}
        </ul>
      )}
      {many && free.length > 0 && (
        <details className="rounded-xl border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Free rooms ({free.length})</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {free.map((r) => (
              <span key={r.id} className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
                {r.name}
              </span>
            ))}
          </div>
        </details>
      )}
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
            <span className="text-muted-foreground">{isIcalNote(note) ? 'Source: ' : 'Reason you gave: '}</span>
            {friendlyNote(note)}
          </p>
        )}
        {isIcalNote(note) && (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            This night is held by a booking on another site. Reopening it here won&apos;t cancel that booking, and the next sync will block it again. To free it, cancel the booking on the other site.
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
  const [showSync, setShowSync] = useState(false)
  useIcalAutoSync(property?.id)
  const [reopen, setReopen] = useState<{ roomId: string; roomName: string; date: string; note: string | null } | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pickedByTap = useRef(false)
  const [peek, setPeek] = useState<{ roomId: string; date: string; state: DayState } | null>(null)
  const queryClient = useQueryClient()

  const selectDay = (d: string) => {
    pickedByTap.current = true
    setSelectedDay(d)
  }
  // After a tap, bring the day panel into view (it sits under the grid, which on
  // a phone can be below the fold). 'nearest' means no movement if already visible.
  useEffect(() => {
    if (pickedByTap.current) {
      pickedByTap.current = false
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedDay])

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
    isFetched: bookingsFetched,
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

  const todayStr = todayYmd()
  const monthPrefix = ymd(year, month, 1).slice(0, 7)
  const monthHasToday = todayStr.startsWith(monthPrefix)
  // The panel shows the tapped day, or today when the viewed month contains it.
  const activeDay = selectedDay && selectedDay.startsWith(monthPrefix) ? selectedDay : monthHasToday ? todayStr : null

  if (propLoading) {
    return (
      <div className="animate-in fade-in duration-300 max-w-5xl mx-auto py-2 md:py-4 px-4">
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
  const isLoading = availLoading || bookingsLoading || (!!property?.id && !bookingsFetched && !bookingsError)
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

  // Single-room view: work out where each stay starts and ends, so a stay can be
  // drawn as ONE bar with the guest's name written once, instead of a cut-off
  // label in every day. Consecutive days with the same `key` are the same stay
  // (or the same block).
  type SingleDay = {
    state: DayState
    name?: string
    key: string | null
    kind: BarKind | null
    label: string
    leaving?: BarKind // a guest leaves this morning: draw a half bar
  }
  const singleDays: SingleDay[] =
    isAll || !view
      ? []
      : Array.from({ length: daysInMonth }, (_, i) => {
          const ds = ymd(year, month, i + 1)
          const info = stateOf(view, ds)
          let key: string | null = null
          let kind: BarKind | null = null
          let label = ''
          if (info.state === 'booked' || info.state === 'pending') {
            const bk = bookingForCell(bookings as unknown as CalBookingRef[], view, ds, info.state)
            key = bk?.id ?? `${info.state}:${info.name ?? ''}`
            kind = info.state
            label = info.name ?? (info.state === 'pending' ? 'Pending' : 'Booked')
          } else if (info.state === 'blocked') {
            const note =
              (availRows as { room_id: string; date: string; note?: string | null }[]).find(
                (r) => r.room_id === view && String(r.date).slice(0, 10) === ds,
              )?.note ?? null
            key = `blocked:${note ?? ''}`
            kind = 'blocked'
            label = (note ? friendlyNote(note) : null) || 'Blocked'
          }
          let leaving: BarKind | undefined
          {
            const out = bookingForCell(bookings as unknown as CalBookingRef[], view, ds, 'checkout')
            if (out) leaving = out.status === 'pending' ? 'pending' : 'booked'
          }
          return { state: info.state, name: info.name, key, kind, label, leaving }
        })

  return (
    <div
      key="calendar-content"
      className="animate-in fade-in slide-in-from-bottom-1 duration-[var(--duration-lazy)] [--tw-ease:var(--ease-lazy)] max-w-5xl mx-auto py-2 md:py-4 px-4"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--section)] text-[var(--section-on)] shadow-[var(--shadow-neu-flat)]">
            <CalendarDays className="h-5 w-5" />
          </span>
          <h1 className="font-display text-xl md:text-2xl font-semibold">Calendar</h1>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {CHANNEL_SYNC_ENABLED && (
            <button
              type="button"
              onClick={() => setShowSync(true)}
              disabled={activeRooms.length === 0}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" /> Sync with other sites
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowBlock(true)}
            disabled={activeRooms.length === 0}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Ban className="h-4 w-4" /> Block dates
          </button>
        </div>
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

      {rooms.length > 5 ? (
        <div className="mb-3">
          <label htmlFor="cal-room" className="sr-only">
            Room
          </label>
          <select
            id="cal-room"
            value={view ?? ALL}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium"
          >
            <option value={ALL}>All rooms</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex gap-2 mb-3 flex-wrap">
          {rooms.length > 1 && (
            <button
              onClick={() => setSelectedRoomId(ALL)}
              className={`press-scale px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-[var(--duration-fast)] ease-[var(--ease-smooth)] ${
                isAll
                  ? 'bg-[var(--section)] text-[var(--section-on)] border-[var(--section)] shadow-[var(--shadow-neu-flat)]'
                  : 'bg-background text-foreground border-border hover:border-[var(--section)]'
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
                  ? 'bg-[var(--section)] text-[var(--section-on)] border-[var(--section)] shadow-[var(--shadow-neu-flat)]'
                  : 'bg-background text-foreground border-border hover:border-[var(--section)]'
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>
      )}

      {isAll && activeRooms.length > 0 && monthHasToday && (() => {
        const t = summarizeDate(index, activeRooms, todayStr)
        const arriving = (bookings as unknown as { check_in?: string | null; status: string }[]).filter(
          (b) => String(b.check_in ?? '').slice(0, 10) === todayStr && b.status !== 'cancelled',
        ).length
        return (
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Today</span>
            <span>
              <strong className="text-foreground">{t.free}</strong> of {t.total} free
            </span>
            <span>
              <strong className="text-foreground">{arriving}</strong> arriving
            </span>
            <span>
              <strong className="text-foreground">{t.leaving}</strong> leaving
            </span>
            {t.pending > 0 && <span className="font-medium text-amber-700">{t.pending} pending</span>}
          </div>
        )
      })()}

      <div className="flex items-center justify-between mb-3 rounded-xl bg-[var(--section)] px-1.5 py-1 text-[var(--section-on)] shadow-[var(--shadow-neu-flat)]">
        <button onClick={prevMonth} className="press-scale p-2 rounded-lg hover:bg-[var(--section-on)]/15 transition-colors" aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-semibold">{monthLabel}</span>
        <button onClick={nextMonth} className="press-scale p-2 rounded-lg hover:bg-[var(--section-on)]/15 transition-colors" aria-label="Next month">
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
          <div className="grid grid-cols-7 bg-[var(--section-soft)] border-b border-border">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-[var(--section-ink)]">
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
                const sm = summarizeDate(index, activeRooms, dateStr)
                const isSel = dateStr === activeDay
                const isPast = dateStr < todayStr
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => selectDay(dateStr)}
                    aria-pressed={isSel}
                    aria-label={`${dateStr}: ${sm.lines.join(', ')}`}
                    className={`h-14 sm:h-20 border-b border-r border-border/50 p-1 sm:p-1.5 text-xs w-full cursor-pointer hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--section)] flex flex-col items-center sm:items-start gap-1 ${s.bg} ${isPast ? 'opacity-60' : ''} ${isSel ? 'ring-2 ring-inset ring-[var(--section)]' : ''}`}
                    title={s.title || undefined}
                  >
                    <DayNum day={day} isToday={dateStr === todayStr} />
                    {sm.total === 0 ? null : sm.total <= DOT_MAX ? (
                      <RoomDots rooms={sm.rooms} />
                    ) : (
                      <div className="w-full space-y-0.5">
                        <div className={`sm:hidden truncate text-center text-[11px] font-medium leading-none ${s.text}`}>
                          {sm.free > 0 ? `${sm.free} free` : s.label}
                        </div>
                        <OccupancyBar s={sm} />
                      </div>
                    )}
                    <div className="hidden sm:block w-full min-w-0">
                      <div className={`truncate font-medium ${s.text}`}>{s.label}</div>
                      <div className="truncate text-[10px] leading-tight">
                        {s.parts.map((p, i) => (
                          <span key={p.text} className={p.cls}>
                            {i > 0 ? ' · ' : ''}
                            {p.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                )
              }

              const sd = singleDays[i]
              const c = CELL[sd.state]
              const isToday = dateStr === todayStr
              const dim = dateStr < todayStr ? 'opacity-60' : ''
              const col = (firstWeekday + i) % 7
              const isRunStart = sd.key !== null && (i === 0 || singleDays[i - 1].key !== sd.key)
              const showBar = sd.kind !== null && (isRunStart || col === 0)
              let barSpan = 1
              if (showBar) {
                while (i + barSpan < daysInMonth && col + barSpan < 7 && singleDays[i + barSpan].key === sd.key) barSpan++
              }
              const contLeft = showBar && !isRunStart
              const contRight = showBar && i + barSpan < daysInMonth && singleDays[i + barSpan].key === sd.key
              // Same-day turnover: one guest leaves, another arrives. The new bar starts mid-cell.
              const turnover = showBar && isRunStart && !!sd.leaving
              // A stay runs from the afternoon of check-in to the morning of check-out, so its
              // bar ends in the MIDDLE of the check-out day's cell. Drawing it that way gives
              // every stay an extra half cell for the guest's name (a one-night stay is otherwise
              // only ~40 px wide) and makes a same-day handover line up cleanly.
              const reachesCheckout =
                showBar && sd.kind !== 'blocked' && !contRight && col + barSpan < 7 && i + barSpan < daysInMonth && !!singleDays[i + barSpan]?.leaving
              const leftPx = contLeft ? 0 : 3
              const rightPx = contRight || reachesCheckout ? 0 : 3

              const inner = (
                <>
                  <div className={dim}>
                    <DayNum day={day} isToday={isToday} />
                  </div>
                  {sd.leaving && (col === 0 || i === 0) && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-0 top-[27px] z-10 h-[22px] w-[calc(50%-2px)] rounded-r-md ${BAR[sd.leaving]} ${dim}`}
                    />
                  )}
                  {showBar && sd.kind && (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute top-[27px] z-10 box-border flex h-[22px] items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-medium leading-none ${BAR[sd.kind]} ${dim} ${contLeft ? 'rounded-l-none' : 'rounded-l-md'} ${contRight ? 'rounded-r-none' : 'rounded-r-md'}`}
                      style={{
                        left: turnover ? 'calc(50% + 1px)' : leftPx,
                        width: `calc(${barSpan * 100}% - ${leftPx + rightPx}px${reachesCheckout ? ' + 50% - 1px' : ''}${turnover ? ' - 50%' : ''})`,
                      }}
                    >
                      <span className="truncate">{barSpan === 1 ? sd.label.split(' ')[0] : sd.label}</span>
                    </span>
                  )}
                  {sd.state === 'open' && !(sd.leaving && (col === 0 || i === 0)) && <div className={`mt-0.5 hidden truncate sm:block ${c.text} ${dim}`}>{c.label}</div>}
                </>
              )
              // Bars sit above their cells but let taps through (pointer-events-none),
              // so every day still opens its own booking card or reopen dialog.
              const base = `relative h-16 border-b border-r border-border/50 p-1.5 text-xs text-left ${sd.kind ? 'bg-card' : c.bg}`

              if (sd.state === 'blocked') {
                const noteText = (availRows as { room_id: string; date: string; note?: string | null }[]).find((r) => r.room_id === view && String(r.date).slice(0, 10) === dateStr)?.note ?? null
                const roomName = rooms.find((r: { id: string }) => r.id === view)?.name ?? 'Room'
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setReopen({ roomId: view as string, roomName, date: dateStr, note: noteText })}
                    className={`${base} flex w-full cursor-pointer flex-col items-start justify-start focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--section)]`}
                    title={noteText ? `Blocked — ${friendlyNote(noteText)}. Tap to reopen.` : 'Blocked. Tap to reopen.'}
                    aria-label={`${dateStr}: blocked${noteText ? `, ${friendlyNote(noteText)}` : ''}. Tap to reopen.`}
                  >
                    {inner}
                  </button>
                )
              }
              // Booked / pending / check-out cells open that booking's card.
              const tappable = sd.state === 'booked' || sd.state === 'pending' || sd.state === 'checkout'
              const openPeek = () => setPeek({ roomId: view as string, date: dateStr, state: sd.state })
              return (
                <div
                  key={dateStr}
                  className={`${base} ${tappable ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--section)]' : ''}`}
                  title={sd.name ? `${c.label} — ${sd.name}${tappable ? '. Tap for details.' : ''}` : c.label}
                  {...(tappable
                    ? {
                        role: 'button' as const,
                        tabIndex: 0,
                        'aria-label': `${dateStr}: ${c.label}${sd.name ? `, ${sd.name}` : ''}`,
                        onClick: openPeek,
                        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPeek() } },
                      }
                    : {})}
                >
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-x-4 gap-y-2 mt-3 text-sm text-muted-foreground flex-wrap">
        {isAll ? (
          activeRooms.length <= DOT_MAX ? (
            (['open', 'booked', 'pending', 'checkout', 'blocked'] as DayState[]).map((st) => (
              <span key={st} className="flex items-center gap-1.5">
                <Dot state={st} />
                {LEGEND_LABEL[st]}
              </span>
            ))
          ) : (
            <>
              <span>Number = rooms free</span>
              {[
                ['bg-blue-500', 'Booked'],
                ['bg-amber-500', 'Pending'],
                ['bg-sky-400', 'Check-out'],
                ['bg-red-500', 'Blocked'],
                ['bg-green-300', 'Free'],
              ].map(([cls, label]) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-4 rounded-full ${cls}`} />
                  {label}
                </span>
              ))}
            </>
          )
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-green-300 bg-green-100" />
              Open
            </span>
            {([['bg-blue-200', 'Booked'], ['bg-amber-200', 'Pending'], ['bg-red-200', 'Blocked']] as const).map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-4 rounded ${cls}`} />
                {label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2 rounded-r bg-blue-200" />
              Guest leaves that morning
            </span>
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {isAll ? <>Tap a day to see each room. Pick a room above to see its bookings.</> : <>Tap a booking to open it. Tap a <strong>blocked</strong> date to reopen it.</>}
      </p>

      {isAll && activeDay && rooms.length > 0 && !isLoading && (
        <DayPanel
          innerRef={panelRef}
          date={activeDay}
          rooms={summarizeDate(index, activeRooms, activeDay).rooms}
          onReopen={(roomId) => {
            const room = activeRooms.find((r: { id: string }) => r.id === roomId)
            const noteText =
              (availRows as { room_id: string; date: string; note?: string | null }[]).find(
                (r) => r.room_id === roomId && String(r.date).slice(0, 10) === activeDay,
              )?.note ?? null
            setReopen({ roomId, roomName: room?.name ?? 'Room', date: activeDay, note: noteText })
          }}
          onView={(roomId, state) => {
            setPeek({ roomId, date: activeDay, state })
          }}
        />
      )}

      {peek && (() => {
        const booking = bookingForCell(bookings as unknown as PeekBooking[], peek.roomId, peek.date, peek.state)
        if (!booking) return null
        const roomName = activeRooms.find((r: { id: string }) => r.id === peek.roomId)?.name ?? 'Room'
        const rows = availRows as { room_id: string; date: string; note?: string | null }[]
        const nightClosed = rows.some((r) => r.room_id === peek.roomId && String(r.date).slice(0, 10) === peek.date)
        return (
          <BookingPeek
            booking={booking}
            roomName={roomName}
            date={peek.date}
            state={peek.state}
            nightClosed={nightClosed}
            onClose={() => setPeek(null)}
            onReopen={() => {
              const noteText = rows.find((r) => r.room_id === peek.roomId && String(r.date).slice(0, 10) === peek.date)?.note ?? null
              setReopen({ roomId: peek.roomId, roomName, date: peek.date, note: noteText })
              setPeek(null)
            }}
          />
        )
      })()}

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

      {CHANNEL_SYNC_ENABLED && showSync && property && (
        <ChannelSyncModal propertyId={property.id} rooms={activeRooms} onClose={() => setShowSync(false)} />
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
