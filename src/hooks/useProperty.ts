import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getSubdomain } from '@/lib/subdomain'

export type Property = {
  id: string
  name: string
  name_ml: string | null
  subdomain: string
  area: string | null
  location_lat: number | null
  location_lng: number | null
  description: string | null
  description_ml: string | null
  hero_image: string | null
  hero_tagline: string | null
  about_image: string | null
  logo_url: string | null          // property logo — shown in header, hero, favicon, PWA icon
  owner_name: string | null
  owner_phone: string | null
  owner_whatsapp: string | null
  check_in_time: string | null
  check_out_time: string | null
  is_active: boolean
  subscription_status: string
  landmark_description: string | null
  static_map_image_url: string | null
  shared_amenities: string[] | null
  rooms: import('@/types/database').Room[]
}

export function useProperty(subdomain?: string) {
  const slug = subdomain ?? getSubdomain()
  return useQuery({
    queryKey: ['property', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, rooms(*)')
        .eq('subdomain', slug)
        .single()
      if (error) throw error
      return data as Property
    },
    enabled: !!slug,
  })
}
