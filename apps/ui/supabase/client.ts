import type { Database } from '@/app/api/database.types'
import { emptySupabase } from '@/lib/local-auth/empty-client'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Phase 1 Mac builds Compose without a Supabase project. @supabase/ssr throws
// "Your project's URL and API key are required" as soon as this runs, including
// during server render of client components, so a missing pair must not call it.
export function createClient(): SupabaseClient<Database> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) return emptySupabase()
    return createBrowserClient<Database>(url, key)
}
