import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef } from 'react'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { Loader2, BedDouble, Plus, X, Pencil, Check, Upload, ImageOff } from 'lucide-react'
import type { Room } from '@/types/database'
import { validateAndCompress, compressionSummary } from '@/lib/imageUtils'

export const Route = createFileRoute('/admin/rooms')({
  component: AdminRooms,
})

const ROOM_TYPES = ['deluxe', 'standard', 'family', 'dormitory', 'suite']
const BED_TYPES = ['king', 'queen', 'twin', 'double', 'single', 'bunk']
const AMENITY_OPTIONS = [
  'ac', 'tv', 'balcony', 'attach_bath', 'heater', 'hot_water',
  'kitchen', 'view', 'wifi', 'wardrobe', 'mini_fridge', 'work_desk',
]

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

type RoomForm = {
  name: string
  room_type: string
  bed_type: string
  max_guests: number
  base_price: string        // string so the field can be cleared while typing
  extra_guest_price: string // string so the field can be cleared while typing
  weekend_multiplier: number
  room_amenities: string[]
  is_active: boolean
}

const emptyForm = (): RoomForm => ({
  name: '',
  room_type: 'deluxe',
  bed_type: 'king',
  max_guests: 2,
  base_price: '2500',
  extra_guest_price: '500',
  weekend_multiplier: 1,
  room_amenities: [],
  is_active: true,
})

// ---------------------------------------------------------------------------
// Room image upload — uses "room" preset (800×600, ≤150 KB output)
// ---------------------------------------------------------------------------

function RoomImageUpload({
  room,
  propertyId,
  onUploaded,
}: {
  room: Room
  propertyId: string
  onUploaded: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<string>('')
  const [error, setError] = useState('')
  const currentImage = room.images?.[0] ?? null

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    setProgress('Checking file…')

    try {
      setProgress('Compressing…')
      const result = await validateAndCompress(file, 'room')
      const { file: compressed } = result

      setProgress(compressionSummary(result))

      const path = `${propertyId}/${room.id}-${Date.now()}.webp`

      const { error: uploadError } = await supabase.storage
        .from('room-images')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('room-images')
        .getPublicUrl(path)

      const { error: dbError } = await supabase
        .from('rooms')
        .update({ images: [urlData.publicUrl] })
        .eq('id', room.id)

      if (dbError) throw dbError

      onUploaded()
      setProgress('')
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : (err as Error).message ?? 'Upload failed')
      setProgress('')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    await supabase.from('rooms').update({ images: [] }).eq('id', room.id)
    onUploaded()
  }

  return (
    <div className="space-y-2">
      <p className={labelCls}>Room Image</p>

      {currentImage ? (
        <div className="relative rounded-lg overflow-hidden">
          <img src={currentImage} alt={room.name} className="w-full h-36 object-cover" />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white text-xs px-2.5 py-1 hover:bg-black/80"
          >
            <Upload className="h-3 w-3" /> Replace
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg h-36 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground text-center px-4">{progress}</p>
            </>
          ) : (
            <>
              <ImageOff className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Tap to upload photo</p>
              <p className="text-[10px] text-muted-foreground/60">JPG / PNG / WebP · max 10 MB</p>
            </>
          )}
        </div>
      )}

      {uploading && currentImage && (
        <p className="text-xs text-muted-foreground">{progress}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={handleUpload}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Room drawer (add / edit)
// ---------------------------------------------------------------------------

function RoomDrawer({
  room,
  propertyId,
  onClose,
  onSaved,
}: {
  room: Room | null
  propertyId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<RoomForm>(
    room
      ? {
          name: room.name,
          room_type: room.room_type,
          bed_type: room.bed_type,
          max_guests: room.max_guests,
          base_price: String(room.base_price),
          extra_guest_price: String(room.extra_guest_price),
          weekend_multiplier: room.weekend_multiplier ?? 1,
          room_amenities: room.room_amenities ?? [],
          is_active: room.is_active,
        }
      : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [customAmenity, setCustomAmenity] = useState('')

  const set = (k: keyof RoomForm, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }))

  const toggleAmenity = (a: string) =>
    set(
      'room_amenities',
      form.room_amenities.includes(a)
        ? form.room_amenities.filter((x) => x !== a)
        : [...form.room_amenities, a]
    )

  const addCustomAmenity = () => {
    const trimmed = customAmenity.trim().toLowerCase()
    if (trimmed && !form.room_amenities.includes(trimmed))
      set('room_amenities', [...form.room_amenities, trimmed])
    setCustomAmenity('')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Room name is required'); return }

    const basePrice = parseFloat(form.base_price)
    const extraGuestPrice = parseFloat(form.extra_guest_price)

    if (!basePrice || basePrice <= 0) { setError('Base price must be greater than 0'); return }
    if (isNaN(extraGuestPrice) || extraGuestPrice < 0) { setError('Extra guest price must be 0 or more'); return }

    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        base_price: basePrice,
        extra_guest_price: extraGuestPrice,
      }
      if (room) {
        const { error: err } = await supabase.from('rooms').update(payload).eq('id', room.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('rooms')
          .insert({ ...payload, property_id: propertyId, images: [] })
        if (err) throw err
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">
            {room ? 'Edit Room' : 'Add New Room'}
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {room && (
            <RoomImageUpload room={room} propertyId={propertyId} onUploaded={onSaved} />
          )}

          <div>
            <label className={labelCls}>Room name *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={inputCls}
              placeholder="e.g. Deluxe Valley View"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Room type</label>
              <select
                value={form.room_type}
                onChange={(e) => set('room_type', e.target.value)}
                className={inputCls}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Bed type</label>
              <select
                value={form.bed_type}
                onChange={(e) => set('bed_type', e.target.value)}
                className={inputCls}
              >
                {BED_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Max guests</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.max_guests}
              onChange={(e) => set('max_guests', parseInt(e.target.value) || 1)}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Base price / night (₹) *</label>
              <input
                type="number"
                min={0}
                value={form.base_price}
                onChange={(e) => set('base_price', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Extra guest / night (₹)</label>
              <input
                type="number"
                min={0}
                value={form.extra_guest_price}
                onChange={(e) => set('extra_guest_price', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Weekend multiplier</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={form.weekend_multiplier}
              onChange={(e) => set('weekend_multiplier', parseFloat(e.target.value) || 1)}
              className={`${inputCls} max-w-[140px]`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              e.g. 1.25 = 25% higher on Fri–Sat
            </p>
          </div>

          <div>
            <label className={labelCls}>Amenities</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {AMENITY_OPTIONS.map((a) => {
                const active = form.room_amenities.includes(a)
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={[
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted',
                    ].join(' ')}
                  >
                    {active && <Check className="inline h-2.5 w-2.5 mr-1" />}
                    {a}
                  </button>
                )
              })}
            </div>

            {form.room_amenities
              .filter((a) => !AMENITY_OPTIONS.includes(a))
              .map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary text-primary-foreground mr-1 mb-1"
                >
                  {a}
                  <button onClick={() => toggleAmenity(a)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}

            <div className="flex gap-2 mt-2">
              <input
                value={customAmenity}
                onChange={(e) => setCustomAmenity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomAmenity()}
                placeholder="Add custom amenity"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={addCustomAmenity}
                className="px-3 rounded-lg border border-border bg-background hover:bg-muted text-sm"
              >
                Add
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => set('is_active', !form.is_active)}
              className={[
                'w-10 h-6 rounded-full transition-colors relative cursor-pointer',
                form.is_active ? 'bg-primary' : 'bg-muted-foreground/30',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  form.is_active ? 'translate-x-5' : 'translate-x-1',
                ].join(' ')}
              />
            </div>
            <span className="text-sm font-medium">
              {form.is_active ? 'Active — visible to guests' : 'Inactive — hidden from guests'}
            </span>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-border space-y-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {room ? 'Save changes' : 'Add room'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AdminRooms() {
  const { data: property, isLoading, error } = useOwnerProperty()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [drawerRoom, setDrawerRoom] = useState<Room | null | undefined>(undefined)

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['ownerProperty', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['property'] })
    setDrawerRoom(undefined)
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )

  if (error || !property)
    return (
      <div className="text-center py-16 text-muted-foreground">
        Could not load property data.
      </div>
    )

  const rooms = property.rooms ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold">Rooms</h1>
          <p className="text-sm text-muted-foreground">
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} ·{' '}
            {rooms.filter((r) => r.is_active).length} active
          </p>
        </div>
        <button
          onClick={() => setDrawerRoom(null)}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add room
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <BedDouble className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">No rooms yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add your first room to start accepting bookings.
          </p>
          <button
            onClick={() => setDrawerRoom(null)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add room
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-card rounded-xl border border-border shadow-sm overflow-hidden"
            >
              {room.images?.[0] ? (
                <img
                  src={room.images[0]}
                  alt={room.name}
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div
                  className="w-full h-40 bg-muted flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => setDrawerRoom(room)}
                >
                  <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                  <p className="text-xs text-muted-foreground">Tap to add photo</p>
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-primary shrink-0" />
                    <h2 className="font-semibold text-foreground">{room.name}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        room.is_active
                          ? 'bg-primary-light text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {room.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => setDrawerRoom(room)}
                      className="h-7 w-7 rounded-md border border-border hover:bg-muted flex items-center justify-center"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex gap-4">
                    <span>
                      Type:{' '}
                      <span className="text-foreground font-medium capitalize">
                        {room.room_type}
                      </span>
                    </span>
                    <span>
                      Bed:{' '}
                      <span className="text-foreground font-medium capitalize">
                        {room.bed_type}
                      </span>
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span>
                      Max:{' '}
                      <span className="text-foreground font-medium">
                        {room.max_guests} guests
                      </span>
                    </span>
                    <span>
                      Base:{' '}
                      <span className="text-foreground font-medium">
                        ₹{room.base_price.toLocaleString('en-IN')}/night
                      </span>
                    </span>
                  </div>
                  {room.extra_guest_price > 0 && (
                    <span>
                      Extra guest:{' '}
                      <span className="text-foreground font-medium">
                        ₹{room.extra_guest_price}/person
                      </span>
                    </span>
                  )}
                </div>

                {room.room_amenities && room.room_amenities.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {room.room_amenities.map((a) => (
                      <span
                        key={a}
                        className="text-xs bg-primary-light/60 text-primary px-2 py-0.5 rounded-full"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {drawerRoom !== undefined && (
        <RoomDrawer
          room={drawerRoom}
          propertyId={property.id}
          onClose={() => setDrawerRoom(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
