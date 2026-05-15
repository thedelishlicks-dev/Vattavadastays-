import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, CheckCircle, MapPin, Image } from 'lucide-react'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettings,
})

function AdminSettings() {
  const queryClient = useQueryClient()
  const { data: property, isLoading } = useOwnerProperty()

  const [form, setForm] = useState({
    name: '', description: '', owner_name: '', owner_phone: '',
    owner_whatsapp: '', check_in_time: '', check_out_time: '',
    location_lat: '', location_lng: '', landmark_description: '',
    static_map_image_url: '',
  })

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name ?? '', description: property.description ?? '',
        owner_name: property.owner_name ?? '', owner_phone: property.owner_phone ?? '',
        owner_whatsapp: property.owner_whatsapp ?? '',
        check_in_time: property.check_in_time ?? '',
        check_out_time: property.check_out_time ?? '',
        location_lat: property.location_lat != null ? property.location_lat.toString() : '',
        location_lng: property.location_lng != null ? property.location_lng.toString() : '',
        landmark_description: property.landmark_description ?? '',
        static_map_image_url: property.static_map_image_url ?? '',
      })
    }
  }, [property])

  const mutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      if (!property?.id) throw new Error('No property loaded')
      const numericUpdates: Record<string, unknown> = { ...updates }
      if (updates.location_lat) numericUpdates.location_lat = parseFloat(updates.location_lat)
      else numericUpdates.location_lat = null
      if (updates.location_lng) numericUpdates.location_lng = parseFloat(updates.location_lng)
      else numericUpdates.location_lng = null
      const { error } = await supabase.from('properties').update(numericUpdates).eq('id', property.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerProperty'] })
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-green-700" /></div>
  if (!property) return <div className="text-center py-16 text-stone-500">Could not load property settings.</div>

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Property Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div><label className="block text-sm font-medium text-stone-700 mb-1">Property Name</label>
          <input type="text" name="name" value={form.name} onChange={handleChange}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
        <div><label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
        <div><label className="block text-sm font-medium text-stone-700 mb-1">Owner Name</label>
          <input type="text" name="owner_name" value={form.owner_name} onChange={handleChange}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
            <input type="tel" name="owner_phone" value={form.owner_phone} onChange={handleChange}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
          <div><label className="block text-sm font-medium text-stone-700 mb-1">WhatsApp</label>
            <input type="tel" name="owner_whatsapp" value={form.owner_whatsapp} onChange={handleChange}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-stone-700 mb-1">Check-in Time</label>
            <input type="time" name="check_in_time" value={form.check_in_time} onChange={handleChange}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
          <div><label className="block text-sm font-medium text-stone-700 mb-1">Check-out Time</label>
            <input type="time" name="check_out_time" value={form.check_out_time} onChange={handleChange}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" /></div>
        </div>

        <div className="border-t border-stone-200 pt-5">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-4 w-4 text-green-700" />
            <h3 className="text-sm font-semibold text-stone-900">Location &amp; Directions</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Latitude</label>
              <input type="text" name="location_lat" inputMode="decimal" value={form.location_lat} onChange={handleChange} placeholder="e.g. 10.12"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Longitude</label>
              <input type="text" name="location_lng" inputMode="decimal" value={form.location_lng} onChange={handleChange} placeholder="e.g. 77.57"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-stone-500 mb-1">Landmark description</label>
            <input type="text" name="landmark_description" value={form.landmark_description} onChange={handleChange}
              placeholder="e.g. 3km from Kovilloor"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" />
            <p className="mt-1 text-xs text-stone-400">Shown on the guest page to help visitors find you.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Static map image URL</label>
            <div className="relative">
              <Image className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input type="url" name="static_map_image_url" value={form.static_map_image_url} onChange={handleChange}
                placeholder="https://storage.supabase.co/..."
                className="w-full rounded-lg border border-stone-300 pl-9 pr-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
            <p className="mt-1 text-xs text-stone-400">Upload a map screenshot to Supabase Storage and paste the public URL here. Leave empty to show coordinate fallback.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={mutation.isPending}
            className="inline-flex items-center gap-2 bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-60 transition-colors">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
          {mutation.isSuccess && <span className="flex items-center gap-1 text-sm text-green-700"><CheckCircle className="h-4 w-4" />Saved!</span>}
          {mutation.isError && <span className="text-sm text-red-600">Save failed — please try again.</span>}
        </div>
      </form>
    </div>
  )
}
