import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/imageUtils'
import { Loader2, Save, CheckCircle, Upload, X } from 'lucide-react'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettings,
})

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1'

function AdminSettings() {
  const queryClient = useQueryClient()
  const { data: property, isLoading } = useOwnerProperty()
  const heroInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '',
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
  })

  const [heroUploading, setHeroUploading] = useState(false)
  const [heroError, setHeroError] = useState('')
  const [heroPreview, setHeroPreview] = useState<string | null>(null)

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name ?? '',
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
      })
      if (property.hero_image) setHeroPreview(property.hero_image)
    }
  }, [property])

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

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !property?.id) return
    setHeroUploading(true)
    setHeroError('')
    try {
      const compressed = await compressImage(file, 'hero')
      const path = `${property.id}/hero-${Date.now()}.webp`
      const { error: uploadError } = await supabase.storage
        .from('hero-images')
        .upload(path, compressed, { upsert: true, contentType: 'image/webp' })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('hero-images')
        .getPublicUrl(path)

      const publicUrl = urlData.publicUrl
      setHeroPreview(publicUrl)
      setForm((f) => ({ ...f, hero_image: publicUrl }))

      // Save immediately to DB
      const { error: dbError } = await supabase
        .from('properties')
        .update({ hero_image: publicUrl })
        .eq('id', property.id)
      if (dbError) throw dbError
      queryClient.invalidateQueries({ queryKey: ['ownerProperty'] })
      queryClient.invalidateQueries({ queryKey: ['property'] })
    } catch (err: unknown) {
      setHeroError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setHeroUploading(false)
      if (heroInputRef.current) heroInputRef.current.value = ''
    }
  }

  const handleRemoveHero = async () => {
    if (!property?.id) return
    setHeroPreview(null)
    setForm((f) => ({ ...f, hero_image: '' }))
    await supabase.from('properties').update({ hero_image: null }).eq('id', property.id)
    queryClient.invalidateQueries({ queryKey: ['ownerProperty'] })
    queryClient.invalidateQueries({ queryKey: ['property'] })
  }

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

        {/* Hero Image */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold">Hero Image</h2>
          <p className="text-xs text-muted-foreground">
            The main image shown at the top of your guest booking page. Compressed automatically for fast loading.
          </p>

          {heroPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={heroPreview}
                alt="Hero preview"
                className="w-full h-48 object-cover"
              />
              <button
                type="button"
                onClick={handleRemoveHero}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => heroInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl h-48 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {heroUploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Compressing and uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Tap to upload hero image</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP · Auto-compressed</p>
                </>
              )}
            </div>
          )}

          <input
            ref={heroInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleHeroUpload}
          />

          {!heroPreview && !heroUploading && (
            <button
              type="button"
              onClick={() => heroInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              <Upload className="h-4 w-4" /> Upload image
            </button>
          )}

          {heroError && <p className="text-xs text-destructive">{heroError}</p>}
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Basic Info</h2>
          <div>
            <label className={labelCls}>Property Name</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4} className={inputCls + ' resize-none'} />
          </div>
        </div>

        {/* Owner Info */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Owner Info</h2>
          <div>
            <label className={labelCls}>Owner Name</label>
            <input type="text" name="owner_name" value={form.owner_name} onChange={handleChange} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" name="owner_phone" value={form.owner_phone} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>WhatsApp</label>
              <input type="tel" name="owner_whatsapp" value={form.owner_whatsapp} onChange={handleChange} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Check-in / Check-out */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-stone-900">Check-in / Check-out</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Check-in Time</label>
              <input type="time" name="check_in_time" value={form.check_in_time} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Check-out Time</label>
              <input type="time" name="check_out_time" value={form.check_out_time} onChange={handleChange} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-stone-900">Location</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Latitude</label>
              <input type="text" name="location_lat" inputMode="decimal" value={form.location_lat} onChange={handleChange} placeholder="e.g. 10.12" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Longitude</label>
              <input type="text" name="location_lng" inputMode="decimal" value={form.location_lng} onChange={handleChange} placeholder="e.g. 77.15" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Landmark Description</label>
            <input type="text" name="landmark_description" value={form.landmark_description} onChange={handleChange} placeholder="e.g. Near St. Mary's Church, 500m from main road" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Static Map Image URL</label>
            <input type="text" name="static_map_image_url" value={form.static_map_image_url} onChange={handleChange} placeholder="https://... (from Supabase Storage)" className={inputCls} />
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
          {mutation.isSuccess && (
            <span className="flex items-center gap-1 text-sm text-primary">
              <CheckCircle className="h-4 w-4" /> Saved!
            </span>
          )}
          {mutation.isError && (
            <span className="text-sm text-destructive">Save failed — please try again.</span>
          )}
        </div>
      </form>
    </div>
  )
}
