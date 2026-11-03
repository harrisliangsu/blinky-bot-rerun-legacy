import type { Database } from '@/app/api/database.types'
import { emptySupabase } from '@/lib/local-auth/empty-client'
import { isBlinkyLocalAuth } from '@/lib/local-auth/mode'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createServiceRoleClient(): SupabaseClient<Database> {
    if (isBlinkyLocalAuth()) return emptySupabase()
    return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
}
