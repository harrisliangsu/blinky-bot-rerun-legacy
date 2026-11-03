import type { Database } from '@/app/api/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

const EMPTY = { data: [] as unknown[], error: null, count: 0 }

class EmptyQuery implements PromiseLike<typeof EMPTY> {
    select() {
        return this
    }
    insert() {
        return this
    }
    update() {
        return this
    }
    upsert() {
        return this
    }
    delete() {
        return this
    }
    eq() {
        return this
    }
    neq() {
        return this
    }
    in() {
        return this
    }
    is() {
        return this
    }
    not() {
        return this
    }
    or() {
        return this
    }
    order() {
        return this
    }
    limit() {
        return this
    }
    range() {
        return this
    }
    gt() {
        return this
    }
    gte() {
        return this
    }
    lt() {
        return this
    }
    lte() {
        return this
    }
    like() {
        return this
    }
    ilike() {
        return this
    }
    filter() {
        return this
    }
    match() {
        return this
    }
    single() {
        return Promise.resolve({ data: null, error: null })
    }
    maybeSingle() {
        return Promise.resolve({ data: null, error: null })
    }
    then<TResult1 = typeof EMPTY, TResult2 = never>(onfulfilled?: ((value: typeof EMPTY) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) {
        return Promise.resolve(EMPTY).then(onfulfilled, onrejected)
    }
}

export function emptySupabase(): SupabaseClient<Database> {
    return {
        from() {
            return new EmptyQuery()
        },
        rpc: async () => ({ data: [], error: null }),
    } as unknown as SupabaseClient<Database>
}
