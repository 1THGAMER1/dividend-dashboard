import { supabase } from './supabaseClient'

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 Stunden

/**
 * Liest den Cache-Eintrag für den aktuellen User aus Supabase.
 * Gibt { data, cachedAt } zurück, oder null wenn kein gültiger Eintrag existiert.
 */
export async function readCache() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('parqet_cache')
    .select('payload, cached_at')
    .eq('user_id', user.id)
    .single()

  if (error || !data) return null

  const age = Date.now() - new Date(data.cached_at).getTime()
  if (age > CACHE_TTL_MS) return null // abgelaufen

  return { payload: data.payload, cachedAt: new Date(data.cached_at) }
}

/**
 * Schreibt die Daten in den Cache (upsert — ein Eintrag pro User).
 */
export async function writeCache(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('parqet_cache')
    .upsert(
      {
        user_id:   user.id,
        payload,
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
}

/**
 * Löscht den Cache-Eintrag des aktuellen Users (z.B. für erzwungenes Refresh).
 */
export async function invalidateCache() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('parqet_cache').delete().eq('user_id', user.id)
}
