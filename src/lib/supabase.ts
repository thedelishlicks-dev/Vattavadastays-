import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = createSupabaseClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
)
