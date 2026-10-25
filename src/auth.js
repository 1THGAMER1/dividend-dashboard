import { supabase } from './supabaseClient'

// Nutzt den Netlify-Proxy, um CORS-Fehler im Browser zu vermeiden
const PARQET_PROXY_BASE = '/.netlify/functions/parqet-proxy'
const PARQET_AUTH_DIRECT = 'https://connect.parqet.com'

let cachedClientId = null

export function clearCachedClientId() {
  cachedClientId = null
}

export async function getClientId() {
  if (cachedClientId) return cachedClientId

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
        .from('profiles')
        .select('parqet_client_id')
        .eq('id', user.id)
        .maybeSingle()

    if (profile?.parqet_client_id) {
      cachedClientId = profile.parqet_client_id
      return cachedClientId
    }
  } catch {
    // Fehler bei DB-Abfrage ignorieren
  }

  const envId = import.meta.env.VITE_PARQET_CLIENT_ID
  if (envId) {
    cachedClientId = envId
    return envId
  }

  return null
}

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
    console.error('Fehler beim Speichern der Parqet Client-ID:', error)
    throw error
  }
}

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

export async function startOAuthFlow() {
  const clientId = await getClientId()
  if (!clientId) {
    throw new Error('Keine Parqet Client-ID gefunden.')
  }

  const codeVerifier = generateRandomString(64)
  sessionStorage.setItem('parqet_code_verifier', codeVerifier)

  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const redirectUri = window.location.origin + window.location.pathname

  // Der Redirect zum Login muss direkt auf connect.parqet.com gehen
  const url = `${PARQET_AUTH_DIRECT}/oauth2/authorize?` + new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'portfolio:read',
  })

  window.location.href = url
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (!code) return false

  const codeVerifier = sessionStorage.getItem('parqet_code_verifier')
  const clientId = await getClientId()
  const redirectUri = window.location.origin + window.location.pathname

  if (!codeVerifier || !clientId) return false

  try {
    // Über den Proxy aufrufen, um CORS zu verhindern
    let res = await fetch(`${PARQET_PROXY_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    })

    if (!res.ok) {
      // Fallback
      res = await fetch(`${PARQET_AUTH_DIRECT}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      })
    }

    if (!res.ok) return false

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

      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash)
      sessionStorage.removeItem('parqet_code_verifier')
      return true
    }
  } catch (err) {
    console.warn('Fehler bei handleCallback:', err)
  }
  return false
}

export async function getAccessToken() {
  let token = sessionStorage.getItem('parqet_access_token')
  if (token) return token

  let refreshToken = localStorage.getItem('parqet_refresh_token')
  let clientId = cachedClientId
  let user = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
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
    // DB nicht erreichbar -> localStorage nutzen
  }

  if (!refreshToken) return null
  if (!clientId) clientId = await getClientId()
  if (!clientId) return null

  try {
    // 1. Über Netlify-Proxy versuchen (kein CORS)
    let res = await fetch(`${PARQET_PROXY_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    })

    if (!res.ok) {
      // 2. Fallback
      res = await fetch(`${PARQET_AUTH_DIRECT}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      })
    }

    if (!res.ok) return null
    const data = await res.json()

    if (data.access_token) {
      sessionStorage.setItem('parqet_access_token', data.access_token)
      if (data.refresh_token) {
        localStorage.setItem('parqet_refresh_token', data.refresh_token)
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

export async function isLoggedIn() {
  const token = await getAccessToken()
  return Boolean(token)
}

export const isParqetConnected = isLoggedIn

export async function logout() {
  sessionStorage.removeItem('parqet_access_token')
  sessionStorage.removeItem('parqet_code_verifier')
  localStorage.removeItem('parqet_refresh_token')
  localStorage.removeItem('skip_parqet')
  clearCachedClientId()

  await supabase.auth.signOut()
  window.location.href = '/'
}

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