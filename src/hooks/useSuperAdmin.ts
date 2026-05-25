import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PropertyRow = {
  id: string
  name: string
  subdomain: string
  owner_name: string | null
  owner_phone: string | null
  owner_whatsapp: string | null
  area: string | null
  is_active: boolean
  subscription_status: 'pending_setup' | 'active' | 'suspended'
  subscription_tier: 'small' | 'large'
  monthly_fee: number
  setup_fee_paid: boolean
  setup_fee_amount: number
  subscription_end_date: string | null
  created_at: string
}

/** Fetch all properties — superadmin only */
export function useAllProperties() {
  return useQuery({
    queryKey: ['superadmin', 'properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PropertyRow[]
    },
  })
}

/** Create a new property + invite token via the DB function */
export function useCreateProperty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      subdomain: string
      owner_email: string
      area?: string
      owner_name?: string
      owner_phone?: string
    }) => {
      const { data, error } = await supabase.rpc('create_property_with_invite', {
        p_name: input.name,
        p_subdomain: input.subdomain,
        p_owner_email: input.owner_email,
        p_area: input.area ?? null,
        p_owner_name: input.owner_name ?? null,
        p_owner_phone: input.owner_phone ?? null,
      })
      if (error) throw error
      return data as {
        property_id: string
        subdomain: string
        invite_token: string
        invite_link: string
        expires_at: string
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'properties'] })
    },
  })
}

/** Update subscription status of a property */
export function useUpdateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      propertyId,
      ...updates
    }: {
      propertyId: string
      subscription_status?: 'pending_setup' | 'active' | 'suspended'
      subscription_end_date?: string | null
      setup_fee_paid?: boolean
    }) => {
      const { error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', propertyId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'properties'] })
    },
  })
}
