import { supabase } from './supabaseClient'

const PARQET_AUTH_BASE = 'https://connect.parqet.com'

// Prüft, ob der Nutzer in Supabase angemeldet ist
export async function getSupabaseUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Prüft, ob der Nutzer Parqet verknüpft hat
export async function isParqetConnected() {
  const user = await getSupabaseUser()
  if (!user) return false

  const { data: profile } = await supabase
      .from('profiles')
      .select('parqet_refresh_token, parqet_client_id')
      .eq('id', user.id)
      .maybeSingle()

  return Boolean(profile?.parqet_refresh_token || localStorage.getItem('parqet_refresh_token'))
}

// Holt den Parqet Access-Token, falls Parqet verbunden ist – gibt null zurück wenn nicht (KEIN CRASH)
export async function getAccessToken() {
  let token = sessionStorage.getItem('parqet_access_token')
  if (token) return token

  const user = await getSupabaseUser()
  if (!user) return null

  const { data: profile } = await supabase
      .from('profiles')
      .select('parqet_refresh_token, parqet_client_id')
      .eq('id', user.id)
      .maybeSingle()

  const refreshToken = profile?.parqet_refresh_token || localStorage.getItem('parqet_refresh_token')
  if (!refreshToken) return null

  const clientId = profile?.parqet_client_id || import.meta.env.VITE_PARQET_CLIENT_ID

  try {
    const res = await fetch(`${PARQET_AUTH_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    })

    if (!res.ok) return null
    const data = await res.json()

    if (data.access_token) {
      sessionStorage.setItem('parqet_access_token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('parqet_refresh_token', data.refresh_token)
        await supabase
            .from('profiles')
            .update({ parqet_refresh_token: data.refresh_token })
            .eq('id', user.id)
      }
      return data.access_token
    }
  } catch (err) {
    console.warn('Parqet Token Refresh fehlgeschlagen:', err.message)
    return null
  }

  return null
}

// Trennt die Parqet-Verknüpfung
export async function disconnectParqet() {
  const user = await getSupabaseUser()
  if (user) {
    await supabase
        .from('profiles')
        .update({ parqet_refresh_token: null, parqet_client_id: null })
        .eq('id', user.id)
  }
  localStorage.removeItem('parqet_refresh_token')
  sessionStorage.removeItem('parqet_access_token')
}