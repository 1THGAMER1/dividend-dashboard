import { supabase } from './supabaseClient'

const PARQET_AUTH_DIRECT = 'https://connect.parqet.com'
const PARQET_PROXY = '/.netlify/functions/parqet-proxy'

let cachedClientId = null

export function clearCachedClientId() {
  cachedClientId = null
}

// Exakt deine registrierte Callback-URI:
export function getRedirectUri() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.origin}/callback`
  }
  return 'https://dividenddashboard.netlify.app/callback'
}

// 1. Synchroner Login-Check
export function isLoggedIn() {
  return Boolean(
      sessionStorage.getItem('parqet_access_token') ||
      localStorage.getItem('parqet_refresh_token')
  )
}

export const isParqetConnected = isLoggedIn

// 2. Client-ID laden
export async function getClientId() {
  if (cachedClientId) return cachedClientId

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
          .from('profiles')
          .select('parqet_client_id')
          .eq('id', user.id)
          .maybeSingle()

      if (profile?.parqet_client_id) {
        cachedClientId = profile.parqet_client_id
        return cachedClientId
      }
    }
  } catch (err) {
    console.warn('Fehler beim Laden der Client-ID:', err)
  }

  const envId = import.meta.env.VITE_PARQET_CLIENT_ID
  if (envId) {
    cachedClientId = envId
    return envId
  }

  return null
}

// 3. Client-ID speichern
export async function saveClientId(clientId) {
  cachedClientId = clientId
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
      .from('profiles')
      .upsert(
          { id: user.id, parqet_client_id: clientId },
          { onConflict: 'id' }
      )

  if (error) {
    console.error('Fehler beim Speichern der Client-ID:', error)
    throw error
  }
}

// 4. PKCE Helfer
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const arr = new Uint8Array(length)
  window.crypto.getRandomValues(arr)
  return Array.from(arr, b => chars[b % chars.length]).join('')
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// 5. Startet den OAuth-Flow zur exakten /callback Route
export async function startOAuthFlow() {
  const clientId = await getClientId()
  if (!clientId) {
    alert('Bitte zuerst die Parqet Client-ID in den Einstellungen eintragen.')
    return
  }

  const codeVerifier = generateRandomString(64)
  const state = generateRandomString(32)

  sessionStorage.setItem('parqet_code_verifier', codeVerifier)
  sessionStorage.setItem('parqet_oauth_state', state)

  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const redirectUri = getRedirectUri()

  const url = `${PARQET_AUTH_DIRECT}/oauth2/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'portfolio:read',
    state: state,
  })

  window.location.href = url
}

// 6. Callback auf /callback abfangen und Code austauschen
export async function handleCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code) return false

  const storedState = sessionStorage.getItem('parqet_oauth_state')
  if (storedState && state && storedState !== state) {
    console.error('OAuth State Mismatch!')
    return false
  }

  const codeVerifier = sessionStorage.getItem('parqet_code_verifier')
  const clientId = await getClientId()
  const redirectUri = getRedirectUri()

  if (!codeVerifier || !clientId) return false

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  try {
    let res = await fetch(`${PARQET_PROXY}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!res.ok) {
      res = await fetch(`${PARQET_AUTH_DIRECT}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    }

    if (!res.ok) {
      console.error('Token-Austausch fehlgeschlagen:', await res.text())
      return false
    }

    const data = await res.json()
    if (data.access_token) {
      sessionStorage.setItem('parqet_access_token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('parqet_refresh_token', data.refresh_token)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
              .from('profiles')
              .update({ parqet_refresh_token: data.refresh_token })
              .eq('id', user.id)
        }
      }

      sessionStorage.removeItem('parqet_code_verifier')
      sessionStorage.removeItem('parqet_oauth_state')

      // Nach erfolgreichem Token-Austausch von /callback auf die Startseite zurückkehren
      window.location.href = window.location.origin + '/#dashboard'
      return true
    }
  } catch (err) {
    console.error('Fehler bei handleCallback:', err)
  }
  return false
}

// 7. Access Token holen
export async function getAccessToken() {
  let token = sessionStorage.getItem('parqet_access_token')
  if (token) return token

  let refreshToken = localStorage.getItem('parqet_refresh_token')
  let clientId = cachedClientId

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
          .from('profiles')
          .select('parqet_refresh_token, parqet_client_id')
          .eq('id', user.id)
          .maybeSingle()

      if (profile?.parqet_refresh_token) refreshToken = profile.parqet_refresh_token
      if (profile?.parqet_client_id) clientId = profile.parqet_client_id
    }
  } catch {
    // DB-Fallback
  }

  if (!refreshToken) return null
  if (!clientId) clientId = await getClientId()
  if (!clientId) return null

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    })

    let res = await fetch(`${PARQET_PROXY}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!res.ok) {
      res = await fetch(`${PARQET_AUTH_DIRECT}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    }

    if (!res.ok) return null
    const data = await res.json()

    if (data.access_token) {
      sessionStorage.setItem('parqet_access_token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('parqet_refresh_token', data.refresh_token)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
              .from('profiles')
              .update({ parqet_refresh_token: data.refresh_token })
              .eq('id', user.id)
        }
      }
      return data.access_token
    }
  } catch {
    return null
  }

  return null
}

// 8. Logout
export async function logout() {
  sessionStorage.removeItem('parqet_access_token')
  sessionStorage.removeItem('parqet_code_verifier')
  sessionStorage.removeItem('parqet_oauth_state')
  localStorage.removeItem('parqet_refresh_token')
  localStorage.removeItem('skip_parqet')
  clearCachedClientId()

  await supabase.auth.signOut()
  window.location.href = '/'
}

// 9. Parqet trennen
export async function disconnectParqet() {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase
        .from('profiles')
        .update({ parqet_refresh_token: null, parqet_client_id: null })
        .eq('id', user.id)
  }
  sessionStorage.removeItem('parqet_access_token')
  localStorage.removeItem('parqet_refresh_token')
}