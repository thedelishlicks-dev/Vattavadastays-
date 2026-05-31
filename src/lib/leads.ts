import { supabase } from './supabase'

export async function submitLead(data: {
  name: string
  phone: string
  property_name?: string
  tier?: string
}) {
  const { error } = await supabase
    .from('leads')
    .insert(data)
  if (error) throw error
}
