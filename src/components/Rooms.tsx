import { useState } from 'react'
import { format } from 'date-fns'
import { BedDouble, Users, Check, X, ChevronDown, Coffee, UtensilsCrossed, Truck, Loader2 } from 'lucide-react'
import type { Room } from '@/types/database'
import type { RoomRate } from '@/lib/roomRates'
import { roomStayPrice } from '@/lib/roomSelection'
import { parseMealsConfig, hasMealInfo } from '@/lib/meals'

interface RoomsProps {
  /** Rooms to show: when dates are chosen, only the ones free for them. */
  rooms: Room[]
  /** How many active rooms are not free for the chosen dates (hidden from the list). */
  hiddenCount: number
  /** False while the availability answer for the current dates is still loading. */
  settled: boolean
  checkIn: Date | null
  checkOut: Date | null
  guests: number
  selectedRoomIds: string[]
  onToggle: (room: Room) => void
  rates?: readonly RoomRate[]
  propertyAmenities?: string[] | null
  /** Room ids that together fit the whole group (empty when the group needs just one room or can't be housed). */
  suggestion: string[]
  suggestionNeeded: boolean
  noRoomsForGroup: boolean
  onUseSuggestion: () => void
  notice: string | null
  onDismissNotice: () => void
}

export function Rooms(p: RoomsProps) {
  const hasDates = !!p.checkIn && !!p.checkOut
  const selected = new Set(p.selectedRoomIds)

  return (
    <section id="rooms" className="py-12 px-4 max-w-6xl mx-auto">
      <div className="mb-6">
        {hasDates && <span className="text-xs uppercase tracking-[0.25em] text-primary font-medium">Step 2</span>}
        <h2 className="mt-1 text-2xl font-bold text-stone-900">{hasDates ? 'Choose your rooms' : 'Our rooms'}</h2>
        {hasDates ? (
          <p className="text-sm text-stone-500 mt-1">
            {format(p.checkIn!, 'd MMM')} → {format(p.checkOut!, 'd MMM')} · {p.guests} guest{p.guests > 1 ? 's' : ''}
          </p>
        ) : (
          <p className="text-sm text-stone-500 mt-1">
            <a href="#availability" className="text-primary underline underline-offset-2">Pick your dates</a> to see what is free and book.
          </p>
        )}
      </div>

      {p.notice && (
        <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{p.notice}</span>
          <button type="button" onClick={p.onDismissNotice} aria-label="Dismiss" className="shrink-0 text-amber-700 hover:text-amber-900"><X className="h-4 w-4" /></button>
        </div>
      )}

      {hasDates && p.settled && p.suggestionNeeded && p.suggestion.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-light/40 px-4 py-3 text-sm">
          <span><span className="font-medium">{p.guests} guests need {p.suggestion.length} rooms.</span> We can pick them for you.</span>
          <button type="button" onClick={p.onUseSuggestion} className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Use suggested rooms</button>
        </div>
      )}

      {hasDates && p.settled && p.noRoomsForGroup && p.rooms.length > 0 && (
        <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The free rooms can't take {p.guests} guests on these dates. Try fewer guests or other dates, or contact the host.
        </div>
      )}

      {hasDates && !p.settled && (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      )}

      {hasDates && p.settled && p.rooms.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-stone-500">
          No rooms are free for these dates. <a href="#availability" className="text-primary underline underline-offset-2">Try other dates.</a>
        </div>
      )}

      {(!hasDates || p.settled) && p.rooms.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {p.rooms.map((room) => (
            <RoomCard key={room.id} room={room} checkIn={p.checkIn} checkOut={p.checkOut} rates={p.rates} propertyAmenities={p.propertyAmenities} isSelected={selected.has(room.id)} canBook={hasDates} onToggle={() => p.onToggle(room)} />
          ))}
        </div>
      )}

      {hasDates && p.settled && p.hiddenCount > 0 && p.rooms.length > 0 && (
        <p className="mt-4 text-xs text-stone-500">{p.hiddenCount} other room{p.hiddenCount > 1 ? 's are' : ' is'} not free for these dates.</p>
      )}
    </section>
  )
}

function RoomCard({ room, checkIn, checkOut, rates, propertyAmenities, isSelected, canBook, onToggle }: {
  room: Room
  checkIn: Date | null
  checkOut: Date | null
  rates?: readonly RoomRate[]
  propertyAmenities?: string[] | null
  isSelected: boolean
  canBook: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(false)
  const stay = roomStayPrice(room, checkIn, checkOut, rates)
  const meals = parseMealsConfig(propertyAmenities)

  return (
    <div className={['rounded-2xl border bg-white overflow-hidden', isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-stone-200'].join(' ')}>
      {room.images?.[0] && (
        <div className="relative">
          <img src={room.images[0]} alt={room.name} loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
          {isSelected && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"><Check className="h-3 w-3" />Added</span>
          )}
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-stone-900">{room.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
            <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" />{room.bed_type}</span>
            <span className="flex items-center gap-1"><Users className="h-4 w-4" />{room.max_guests} guest{room.max_guests > 1 ? 's' : ''} included</span>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            {stay.nights > 0 ? (
              <>
                <div className="font-semibold text-stone-900">₹{stay.roomCost.toLocaleString('en-IN')}</div>
                <div className="text-xs text-stone-500">for {stay.nights} night{stay.nights > 1 ? 's' : ''}</div>
              </>
            ) : (
              <>
                <div className="font-semibold text-stone-900">₹{room.base_price.toLocaleString('en-IN')}</div>
                <div className="text-xs text-stone-500">per night</div>
              </>
            )}
          </div>
          {canBook ? (
            <button type="button" onClick={onToggle} className={isSelected ? 'rounded-full border border-primary/40 bg-primary-light px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10' : 'rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90'}>
              {isSelected ? 'Remove' : 'Add'}
            </button>
          ) : (
            <a href="#availability" className="rounded-full border border-border px-4 py-2 text-xs font-medium text-stone-600 hover:bg-muted">Pick dates</a>
          )}
        </div>

        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between border-t border-stone-100 pt-3 text-xs font-medium text-stone-500 hover:text-stone-800">
          <span>{open ? 'Hide details' : 'Room details'}</span>
          <ChevronDown className={['h-4 w-4 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
        </button>

        {open && (
          <div className="space-y-3 text-sm text-stone-600">
            {(room.room_amenities?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {room.room_amenities.map((a) => <span key={a} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{a}</span>)}
              </div>
            )}
            <p className="text-xs">
              Price covers {room.max_guests} guest{room.max_guests > 1 ? 's' : ''} (adults and children).
              {(room.extra_guest_price ?? 0) > 0 && <> Each extra guest is ₹{room.extra_guest_price.toLocaleString('en-IN')}/night.</>}
            </p>
            {stay.seasonalNights > 0 && (
              <p className="text-xs">{stay.rateLabels.length > 0 ? `Includes ${stay.rateLabels.join(', ')} rates` : 'Includes special seasonal rates'} for {stay.seasonalNights} night{stay.seasonalNights > 1 ? 's' : ''}.</p>
            )}
            {hasMealInfo(meals) && (
              <div className="space-y-1.5 text-xs">
                {meals.breakfast === 'included' && <div className="flex items-start gap-2"><Coffee className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />Breakfast is included.</div>}
                {meals.breakfast === 'paid' && <div className="flex items-start gap-2"><Coffee className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />Breakfast available{meals.breakfast_note ? ` — ${meals.breakfast_note}` : ''}.</div>}
                {meals.kitchen_available && <div className="flex items-start gap-2"><UtensilsCrossed className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />Lunch and dinner on order{meals.kitchen_note ? ` — ${meals.kitchen_note}` : ''}.</div>}
                {meals.delivery_available && <div className="flex items-start gap-2"><Truck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />Food delivery can be arranged{meals.delivery_note ? ` — ${meals.delivery_note}` : ''}.</div>}
                <p className="text-stone-400">Meals are added to your bill during your stay.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
