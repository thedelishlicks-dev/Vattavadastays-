import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PropertyActivity } from '@/lib/onboarding'

export type PropertyRow = {
  id: string
  name: string
  subdomain: string
  owner_name: string | null
  owner_phone: string | null
  owner_whatsapp: string | null
  /** auth user linked as owner (null until the owner is linked) */
  owner_id: string | null
  owner_email?: string | null
  area: string | null
  is_active: boolean
  /** 'trial' is what new properties get; 'pending_setup' is the older name for the same stage. */
  subscription_status: 'trial' | 'pending_setup' | 'active' | 'suspended'
  subscription_tier: 'small' | 'large'
  monthly_fee: number
  setup_fee_paid: boolean
  setup_fee_amount: number
  billing_notes: string | null
  subscription_end_date: string | null
  /** config sentinels (__upi:, __cancel:, __rules: …) — used for the setup checklist */
  shared_amenities: string[] | null
  hero_image: string | null
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
      subscription_status?: 'trial' | 'pending_setup' | 'active' | 'suspended'
      subscription_end_date?: string | null
      setup_fee_paid?: boolean
      subscription_tier?: 'small' | 'large'
      monthly_fee?: number
      setup_fee_amount?: number
      billing_notes?: string | null
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

/**
 * Per-property activity for the setup checklist: active rooms, how many are
 * priced, and booking count / newest booking. Superadmin RLS lets this read
 * every property's rooms and bookings.
 * Rooms come in one request (a few per property; PostgREST caps a request at
 * 1,000 rows — fine for hundreds of properties). Bookings use one count-only
 * request per property so the number stays exact however many bookings exist.
 */
export function usePropertyActivity(propertyIds: string[]) {
  const key = [...propertyIds].sort().join(',')
  return useQuery({
    queryKey: ['superadmin', 'activity', key],
    enabled: propertyIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, PropertyActivity> = {}
      for (const id of propertyIds) out[id] = { rooms: 0, pricedRooms: 0, bookings: 0, lastBookingAt: null }

      const { data: rooms, error: roomsErr } = await supabase
        .from('rooms')
        .select('property_id, base_price, is_active')
        .in('property_id', propertyIds)
        .eq('is_active', true)
      if (roomsErr) throw roomsErr
      for (const r of (rooms ?? []) as { property_id: string; base_price: number | null }[]) {
        const a = out[r.property_id]
        if (!a) continue
        a.rooms += 1
        if (Number(r.base_price) > 0) a.pricedRooms += 1
      }

      await Promise.all(propertyIds.map(async (id) => {
        const { data, count, error } = await supabase
          .from('bookings')
          .select('created_at', { count: 'exact' })
          .eq('property_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) throw error
        out[id].bookings = count ?? 0
        out[id].lastBookingAt = (data?.[0] as { created_at: string } | undefined)?.created_at ?? null
      }))
      return out
    },
  })
}

export type InviteOutcome = 'invited' | 'linked_existing'

/** Error from the invite-owner function, with a machine-readable code. */
export class InviteError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * One click: email the owner a "set your password" link (or, if they already
 * have a login, just link it) and attach the account to the property.
 * Runs in the `invite-owner` Edge Function, which only accepts the superadmin.
 */
export function useInviteOwner() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { propertyId: string; email: string; replace?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('invite-owner', {
        body: { property_id: input.propertyId, email: input.email, replace: !!input.replace },
      })
      if (error) {
        let message = 'Could not reach the invite service.'
        let code = 'unknown'
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json()
            message = body?.message ?? body?.error ?? message
            code = body?.code ?? code
          } catch { /* keep defaults */ }
        } else if (/not found|404/i.test(String((error as Error).message))) {
          message = 'The invite service is not deployed yet. Use Supabase → Authentication → Invite user, then "Link existing account".'
          code = 'not_deployed'
        }
        throw new InviteError(message, code)
      }
      return data as { outcome: InviteOutcome; user_id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'properties'] })
    },
  })
}
