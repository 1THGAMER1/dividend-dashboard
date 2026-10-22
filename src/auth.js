import { supabase } from './supabaseClient'
import { decrypt, encrypt, isEncrypted, clearCachedKey } from './utils/crypto.js'
import { getPassword } from './passwordStore.js'

let _clientIdPromise = null
let _refreshPromise = null

// Nur Parqet-Tokens löschen, Supabase-Anmeldung bleibt bestehen
function clearParqetTokens() {
  sessionStorage.removeItem('parqet_access_token')
  sessionStorage.removeItem('parqet_expires_at')
  localStorage.removeItem('parqet_refresh_token')
}

// Speichert den aktuellen Parqet-Refresh-Token für den wöchentlichen Newsletter in Supabase
async function syncRefreshTokenToSupabase(refreshToken) {
  if (!refreshToken) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
        .from('profiles')
        .update({
          parqet_refresh_token: refreshToken,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
  } catch (err) {
    console.warn('[auth] Refresh-Token Sync fehlgeschlagen:', err.message)
  }
}

const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/callback'
const AUTH_URL     = 'https://connect.parqet.com/oauth2/authorize'
const TOKEN_URL    = '/oauth/token'
const SCOPE        = 'portfolio:read'

export async function getClientId() {
  if (_clientIdPromise) return _clientIdPromise
  _clientIdPromise = _fetchClientId()
  return _clientIdPromise
}

async function _fetchClientId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('parqet_client_id')
    .eq('id', user.id)
    .single()

  if (error) throw error

  const raw = data?.parqet_client_id || null
  if (!raw) return null

  if (!isEncrypted(raw)) {
    const password = getPassword()
    if (password) {
      try {
        const encrypted = await encrypt(raw, password)
        await supabase
          .from('profiles')
          .update({ parqet_client_id: encrypted })
          .eq('id', user.id)
      } catch (e) {
        console.warn('Auto-migration of client ID failed:', e)
      }
    }
    return raw
  }

  try {
    return await decrypt(raw, getPassword())
  } catch {
    return null
  }
}

export function clearCachedClientId() {
  _clientIdPromise = null
}
export async function saveClientId(newClientId) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Nicht eingeloggt')

  const clean = newClientId.trim()
  if (!clean) throw new Error('Client ID darf nicht leer sein')

  // Verschlüsseln mit dem Passwort (oder vorhandenem Key aus IndexedDB)
  const password = getPassword()
  const encrypted = await encrypt(clean, password)

  const { error } = await supabase
      .from('profiles')
      .update({
        parqet_client_id: encrypted,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

  if (error) throw error

  // Cache leeren und auf die neue ID setzen
  clearCachedClientId()
  _clientIdPromise = Promise.resolve(clean)
  return clean
}

function generateCodeVerifier() {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]))
}

async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]))
}

// Cookie-Hilfsfunktionen: tab-übergreifend persistent (behebt State mismatch
// wenn Samsung Browser / externe Apps den Callback in einem neuen Tab öffnen)
function setCookie(name, value, maxAgeSec = 300) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax${secure}`
}

function getCookie(name) {
  const match = document.cookie.split('; ').find(r => r.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

function deleteCookie(name) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

export async function startOAuthFlow() {
  const clientId = await getClientId()
  if (!clientId) throw new Error('Keine Parqet Client ID hinterlegt')

  const verifier  = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state     = crypto.randomUUID()

  // Cookies statt sessionStorage: überleben Tab-Wechsel und externe Browser-Sprünge
  setCookie('pkce_verifier', verifier)
  setCookie('oauth_state', state)

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPE,
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  })
  window.location.href = `${AUTH_URL}?${params}`
}

export async function handleCallback() {
  const clientId = await getClientId()
  if (!clientId) throw new Error('Keine Parqet Client ID hinterlegt')

  const params = new URLSearchParams(window.location.search)
  const code   = params.get('code')
  const state  = params.get('state')
  const error  = params.get('error')

  if (error) throw new Error(`OAuth Fehler: ${error}`)
  if (!code) throw new Error('Kein Authorization Code erhalten')

  const savedState = getCookie('oauth_state')
  if (state !== savedState) throw new Error('State mismatch')

  const verifier = getCookie('pkce_verifier')
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     clientId,
    code_verifier: verifier,
  })

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token exchange fehlgeschlagen (${res.status}): ${await res.text()}`)

  const tokens    = await res.json()
  const expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000

  sessionStorage.setItem('parqet_access_token', tokens.access_token)
  sessionStorage.setItem('parqet_expires_at',   String(expiresAt))
  if (tokens.refresh_token) {
    localStorage.setItem('parqet_refresh_token', tokens.refresh_token)
  }
  if (tokens.refresh_token) {
    syncRefreshTokenToSupabase(tokens.refresh_token).catch(() => {})
  }

  deleteCookie('pkce_verifier')
  deleteCookie('oauth_state')
  window.history.replaceState({}, '', '/')
  return tokens.access_token
}

export async function getAccessToken() {
  const token        = sessionStorage.getItem('parqet_access_token')
  const expiresAt    = Number(sessionStorage.getItem('parqet_expires_at') || 0)
  const refreshToken = localStorage.getItem('parqet_refresh_token')

  if (token && Date.now() < expiresAt - 60_000) return token
  if (!refreshToken) return null

  // Läuft schon eine Erneuerung, auf diese warten statt eine zweite zu starten
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = (async () => {
    const clientId = await getClientId().catch(() => null)
    if (!clientId) return null // kurzzeitig keine Client-ID: nichts löschen

    let res
    try {
      res = await fetch(TOKEN_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     clientId,
        }),
      })
    } catch {
      return null // Netzwerkfehler: Tokens behalten, später erneut versuchen
    }

    if (!res.ok) {
      // Nur bei echter Ablehnung (Refresh-Token ungültig oder abgelaufen) löschen
      if (res.status === 400 || res.status === 401) clearParqetTokens()
      return null
    }

    const tokens = await res.json()
    sessionStorage.setItem('parqet_access_token', tokens.access_token)
    sessionStorage.setItem('parqet_expires_at',   String(Date.now() + (tokens.expires_in || 3600) * 1000))
    if (tokens.refresh_token) localStorage.setItem('parqet_refresh_token', tokens.refresh_token)
    if (tokens.refresh_token) {
      syncRefreshTokenToSupabase(tokens.refresh_token).catch(() => {})
    }
    return tokens.access_token
  })()

  try {
    return await _refreshPromise
  } finally {
    _refreshPromise = null
  }
}

export async function logout() {
  sessionStorage.removeItem('parqet_access_token')
  sessionStorage.removeItem('parqet_expires_at')
  localStorage.removeItem('parqet_refresh_token')
  localStorage.removeItem('parqet_access_token')
  localStorage.removeItem('parqet_expires_at')
  deleteCookie('pkce_verifier')
  deleteCookie('oauth_state')
  clearCachedKey()

  await supabase.auth.signOut()
  clearCachedClientId()
  window.location.href = '/'
}

export function isLoggedIn() {
  return !!sessionStorage.getItem('parqet_access_token') ||
         !!localStorage.getItem('parqet_refresh_token')
}
