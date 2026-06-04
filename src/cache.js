import { supabase } from './supabaseClient'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 Stunden

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function fetchCacheRow(userId) {
  const { data, error } = await supabase
    .from('parqet_cache')
    .select('payload, cached_at')
    .eq('user_id', userId)
    .single()
  if (error || !data) return null
  return { payload: data.payload, cachedAt: new Date(data.cached_at) }
}

/**
 * Liest den Cache nur wenn er noch gültig (< 6h alt) ist.
 */
export async function readCache() {
  const userId = await getCurrentUserId()
  if (!userId) return null
  const row = await fetchCacheRow(userId)
  if (!row) return null
  const age = Date.now() - row.cachedAt.getTime()
  if (age > CACHE_TTL_MS) return null // abgelaufen
  return row
}

/**
 * Liest den Cache auch wenn er abgelaufen ist (Stale-Fallback bei Rate-Limit).
 */
export async function readStaleCache() {
  const userId = await getCurrentUserId()
  if (!userId) return null
  return await fetchCacheRow(userId) // keine TTL-Prüfung
}

/**
 * Schreibt / aktualisiert den Cache-Eintrag für den aktuellen User.
 */
export async function writeCache(payload) {
  const userId = await getCurrentUserId()
  if (!userId) return
  await supabase
    .from('parqet_cache')
    .upsert(
      { user_id: userId, payload, cached_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
}

/**
 * Löscht den Cache-Eintrag (z.B. beim Logout oder erzwungenem Reset).
 */
export async function invalidateCache() {
  const userId = await getCurrentUserId()
  if (!userId) return
  await supabase.from('parqet_cache').delete().eq('user_id', userId)
}
