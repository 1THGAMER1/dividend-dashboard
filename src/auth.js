import { supabase } from './supabaseClient'
import { decrypt, encrypt, isEncrypted, clearCachedKey } from './crypto'
import { getPassword } from './passwordStore'

let CLIENT_ID = null
let _clientIdPromise = null  // laufendes Promise zwischenspeichern

const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/callback'
const AUTH_URL     = 'https://connect.parqet.com/oauth2/authorize'
const TOKEN_URL    = '/oauth/token'
const SCOPE        = 'portfolio:read'

export async function getClientId() {
  // Bereits gecacht
  if (CLIENT_ID) return CLIENT_ID

  // Bereits ein laufender Request → denselben abwarten statt neuen starten
  if (_clientIdPromise) return _clientIdPromise

  _clientIdPromise = _fetchClientId().finally(() => {
    _clientIdPromise = null
  })
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

  // -------------------------------------------------------------------------
  // Auto-migration: plaintext → encrypted
  // -------------------------------------------------------------------------
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
    CLIENT_ID = raw
    return CLIENT_ID
  }

  // -------------------------------------------------------------------------
  // Decrypt
  // -------------------------------------------------------------------------
  try {
    CLIENT_ID = await decrypt(raw, getPassword())
  } catch {
    CLIENT_ID = null
  }
  return CLIENT_ID
}

export function clearCachedClientId() {
  CLIENT_ID = null
  _clientIdPromise = null
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

export async function startOAuthFlow() {
  const clientId = await getClientId()
  if (!clientId) throw new Error('Keine Parqet Client ID hinterlegt')

  const verifier  = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state     = crypto.randomUUID()

  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('oauth_state', state)

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
  if (state !== sessionStorage.getItem('oauth_state')) throw new Error('State mismatch')

  const verifier = sessionStorage.getItem('pkce_verifier')
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

  sessionStorage.removeItem('pkce_verifier')
  sessionStorage.removeItem('oauth_state')
  window.history.replaceState({}, '', '/')
  return tokens.access_token
}

export async function getAccessToken() {
  const token        = sessionStorage.getItem('parqet_access_token')
  const expiresAt    = Number(sessionStorage.getItem('parqet_expires_at') || 0)
  const refreshToken = localStorage.getItem('parqet_refresh_token')
  const clientId     = await getClientId()

  if (!token && !refreshToken) return null

  if (token && Date.now() < expiresAt - 60_000) return token

  if (!refreshToken || !clientId) { logout(); return null }

  try {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
    })
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error('Refresh failed')
    const tokens = await res.json()

    sessionStorage.setItem('parqet_access_token', tokens.access_token)
    sessionStorage.setItem('parqet_expires_at',   String(Date.now() + (tokens.expires_in || 3600) * 1000))
    if (tokens.refresh_token) localStorage.setItem('parqet_refresh_token', tokens.refresh_token)

    return tokens.access_token
  } catch {
    logout()
    return null
  }
}

export async function logout() {
  sessionStorage.removeItem('parqet_access_token')
  sessionStorage.removeItem('parqet_expires_at')
  localStorage.removeItem('parqet_refresh_token')
  localStorage.removeItem('parqet_access_token')
  localStorage.removeItem('parqet_expires_at')
  clearCachedKey()

  await supabase.auth.signOut()
  clearCachedClientId()
  window.location.href = '/'
}

export function isLoggedIn() {
  return !!sessionStorage.getItem('parqet_access_token') ||
         !!localStorage.getItem('parqet_refresh_token')
}
