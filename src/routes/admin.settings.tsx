import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, CheckCircle, Upload, X } from 'lucide-react'
import { validateAndCompress, formatBytes, type ImagePreset } from '@/lib/imageUtils'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettings,
})

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

// ---------------------------------------------------------------------------
// Generic image upload widget used for hero / about / logo
// ---------------------------------------------------------------------------

interface ImageUploadProps {
  label: string
  hint: string
  /** Supabase Storage bucket name */
  bucket: string
  /** Path prefix inside the bucket — typically the property id */
  pathPrefix: string
  /** File name stem before the timestamp, e.g. "hero" | "about" | "logo" */
  stem: string
  /** imageUtils preset controlling resize + quality targets */
  preset: ImagePreset
  /** Current public URL (if any) */
  currentUrl: string | null
  previewClassName?: string
  onUploaded: (publicUrl: string) => void
  onRemoved: () => void
}

function ImageUploadField({
  label,
  hint,
  bucket,
  pathPrefix,
  stem,
  preset,
  currentUrl,
  previewClassName = 'w-full h-48 object-cover',
  onUploaded,
  onRemoved,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    setProgress('Checking file…')

    try {
      setProgress('Compressing…')
      const { file: compressed, originalBytes, compressedBytes, savingPct } =
        await validateAndCompress(file, preset)

      setProgress(
        `${formatBytes(originalBytes)} → ${formatBytes(compressedBytes)} (−${savingPct}%)`
      )

      const path = `${pathPrefix}/${stem}-${Date.now()}.webp`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
      onUploaded(urlData.publicUrl)
      setProgress('')
    } catch (err: unknown) {
      setError(typeof err === 'string' ? err : (err as Error).message ?? 'Upload failed')
      setProgress('')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const isLogo = preset === 'logo'

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>

      {currentUrl ? (
        <div className="relative rounded-xl overflow-hidden inline-block w-full">
          <img
            src={currentUrl}
            alt={label}
            className={isLogo ? 'h-20 w-20 object-cover rounded-full' : previewClassName}
          />
          <button
            type="button"
            onClick={onRemoved}
            className={
              isLogo
                ? 'absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80'
                : 'absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80'
            }
          >
            <X className={isLogo ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
          {/* Replace button overlaid on bottom-right */}
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
          className={[
            'border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors',
            isLogo ? 'h-32 w-32' : 'h-48',
          ].join(' ')}
        >
          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground text-center px-3">{progress}</p>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tap to upload</p>
              <p className="text-xs text-muted-foreground/60">JPG / PNG / WebP · max 10 MB</p>
            </>
          )}
        </div>
      )}

      {uploading && currentUrl && (
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

      {!currentUrl && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          <Upload className="h-4 w-4" /> Upload {label.toLowerCase()}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

function AdminSettings() {
  const queryClient = useQueryClient()
  const { data: property, isLoading } = useOwnerProperty()

  const [form, setForm] = useState({
    name: '',
    hero_tagline: '',
    description: '',
    owner_name: '',
    owner_phone: '',
    owner_whatsapp: '',
    check_in_time: '',
    check_out_time: '',
    location_lat: '',
    location_lng: '',
    landmark_description: '',
    static_map_image_url: '',
    hero_image: '',
    about_image: '',
    logo_url: '',
  })

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name ?? '',
        hero_tagline: property.hero_tagline ?? '',
        description: property.description ?? '',
        owner_name: property.owner_name ?? '',
        owner_phone: property.owner_phone ?? '',
        owner_whatsapp: property.owner_whatsapp ?? '',
        check_in_time: property.check_in_time ?? '',
        check_out_time: property.check_out_time ?? '',
        location_lat: property.location_lat != null ? property.location_lat.toString() : '',
        location_lng: property.location_lng != null ? property.location_lng.toString() : '',
        landmark_description: property.landmark_description ?? '',
        static_map_image_url: property.static_map_image_url ?? '',
        hero_image: property.hero_image ?? '',
        about_image: property.about_image ?? '',
        logo_url: property.logo_url ?? '',
      })
    }
  }, [property])

  // Helper to persist a single image URL to the DB and update local form state
  const persistImage = async (column: string, url: string | null) => {
    if (!property?.id) return
    await supabase
      .from('properties')
      .update({ [column]: url })
      .eq('id', property.id)
    queryClient.invalidateQueries({ queryKey: ['ownerProperty'] })
    queryClient.invalidateQueries({ queryKey: ['property'] })
    setForm((f) => ({ ...f, [column]: url ?? '' }))
  }

  const mutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      if (!property?.id) throw new Error('No property loaded')
      const payload: Record<string, unknown> = { ...updates }
      payload.location_lat = updates.location_lat ? parseFloat(updates.location_lat) : null
      payload.location_lng = updates.location_lng ? parseFloat(updates.location_lng) : null
      const { error } = await supabase.from('properties').update(payload).eq('id', property.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerProperty'] })
      queryClient.invalidateQueries({ queryKey: ['property'] })
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Could not load property settings.
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Property Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Logo ── */}
        <ImageUploadField
          label="Logo"
          hint="Square image shown in the header. Recommended 120×120 px or larger square."
          bucket="hero-images"
          pathPrefix={property.id}
          stem="logo"
          preset="logo"
          currentUrl={form.logo_url || null}
          previewClassName="h-20 w-20 object-cover rounded-full"
          onUploaded={(url) => persistImage('logo_url', url)}
          onRemoved={() => persistImage('logo_url', null)}
        />

        {/* ── Hero image ── */}
        <ImageUploadField
          label="Hero Image"
          hint="Full-width banner at the top of your guest booking page. Compressed to ≤250 KB for fast loading on mobile."
          bucket="hero-images"
          pathPrefix={property.id}
          stem="hero"
          preset="hero"
          currentUrl={form.hero_image || null}
          onUploaded={(url) => persistImage('hero_image', url)}
          onRemoved={() => persistImage('hero_image', null)}
        />

        {/* ── About image ── */}
        <ImageUploadField
          label="About Section Image"
          hint="Shown beside your property description. Landscape photo works best."
          bucket="hero-images"
          pathPrefix={property.id}
          stem="about"
          preset="about"
          currentUrl={form.about_image || null}
          onUploaded={(url) => persistImage('about_image', url)}
          onRemoved={() => persistImage('about_image', null)}
        />

        {/* ── Static map ── */}
        <ImageUploadField
          label="Static Map Image"
          hint="A screenshot of your property location on Google Maps. Used instead of a map embed — loads in under 1 second on 2G."
          bucket="hero-images"
          pathPrefix={property.id}
          stem="map"
          preset="staticMap"
          currentUrl={form.static_map_image_url || null}
          onUploaded={(url) => persistImage('static_map_image_url', url)}
          onRemoved={() => persistImage('static_map_image_url', null)}
        />

        {/* ── Basic info ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Basic Info</h2>

          <div>
            <label className={labelCls}>Property Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Hero Tagline</label>
            <input
              type="text"
              name="hero_tagline"
              value={form.hero_tagline}
              onChange={handleChange}
              placeholder="Short tagline for hero banner (e.g. A 3-room mountain retreat…)"
              className={inputCls}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown on the hero banner. Keep it short and punchy.
            </p>
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              className={inputCls + ' resize-none'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown in the About section. Can be longer and more detailed.
            </p>
          </div>
        </div>

        {/* ── Owner info ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Owner Info</h2>

          <div>
            <label className={labelCls}>Owner Name</label>
            <input
              type="text"
              name="owner_name"
              value={form.owner_name}
              onChange={handleChange}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                name="owner_phone"
                value={form.owner_phone}
                onChange={handleChange}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <input
                type="tel"
                name="owner_whatsapp"
                value={form.owner_whatsapp}
                onChange={handleChange}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── Check-in / out ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-900">Check-in / Check-out</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Check-in Time</label>
              <input
                type="time"
                name="check_in_time"
                value={form.check_in_time}
                onChange={handleChange}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Check-out Time</label>
              <input
                type="time"
                name="check_out_time"
                value={form.check_out_time}
                onChange={handleChange}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── Location ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Location</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Latitude</label>
              <input
                type="text"
                name="location_lat"
                inputMode="decimal"
                value={form.location_lat}
                onChange={handleChange}
                placeholder="e.g. 10.12"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Longitude</label>
              <input
                type="text"
                name="location_lng"
                inputMode="decimal"
                value={form.location_lng}
                onChange={handleChange}
                placeholder="e.g. 77.15"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Landmark Description</label>
            <input
              type="text"
              name="landmark_description"
              value={form.landmark_description}
              onChange={handleChange}
              placeholder="e.g. Near St. Mary's Church, 500m from main road"
              className={inputCls}
            />
          </div>
        </div>

        {/* ── Save ── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </button>

          {mutation.isSuccess && (
            <span className="flex items-center gap-1 text-sm text-primary">
              <CheckCircle className="h-4 w-4" /> Saved!
            </span>
          )}

          {mutation.isError && (
            <span className="text-sm text-destructive">
              Save failed — please try again.
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
