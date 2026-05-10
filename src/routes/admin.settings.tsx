import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOwnerProperty } from '@/hooks/useOwnerProperty'
import { supabase } from '@/lib/supabase'
import { Loader2, Save, CheckCircle } from 'lucide-react'

export const Route = createFileRoute('/admin/settings')({
  component: AdminSettings,
})

function AdminSettings() {
  const queryClient = useQueryClient()
  const { data: property, isLoading } = useOwnerProperty()

  const [form, setForm] = useState({
    name: '',
    description: '',
    owner_name: '',
    owner_phone: '',
    owner_whatsapp: '',
    check_in_time: '',
    check_out_time: '',
  })

  // Populate form once data arrives
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
      })
    }
  }, [property])

  const mutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      if (!property?.id) throw new Error('No property loaded')
      const { error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', property.id)
      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate so useOwnerProperty refetches fresh data
      queryClient.invalidateQueries({ queryKey: ['owner-property'] })
    },
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-green-700" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-16 text-stone-500">
        Could not load property settings.
      </div>
    )
  }

  const fields: {
    label: string
    name: keyof typeof form
    type?: string
    textarea?: boolean
  }[] = [
    { label: 'Property Name', name: 'name' },
    { label: 'Description', name: 'description', textarea: true },
    { label: 'Owner Name', name: 'owner_name' },
    { label: 'Phone', name: 'owner_phone', type: 'tel' },
    { label: 'WhatsApp', name: 'owner_whatsapp', type: 'tel' },
    { label: 'Check-in Time', name: 'check_in_time', type: 'time' },
    { label: 'Check-out Time', name: 'check_out_time', type: 'time' },
  ]

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-stone-900 mb-6">Property Settings</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {fields.map(({ label, name, type = 'text', textarea }) => (
          <div key={name}>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              {label}
            </label>
            {textarea ? (
              <textarea
                name={name}
                value={form[name]}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700"
              />
            ) : (
              <input
                type={type}
                name={name}
                value={form[name]}
                onChange={handleChange}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-green-700"
              />
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 bg-green-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-60 transition-colors"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </button>

          {mutation.isSuccess && (
            <span className="flex items-center gap-1 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              Saved!
            </span>
          )}

          {mutation.isError && (
            <span className="text-sm text-red-600">
              Save failed — please try again.
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
