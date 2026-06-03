const CLIENT_ID    = import.meta.env.VITE_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/callback'
const AUTH_URL     = 'https://connect.parqet.com/oauth2/authorize'
const TOKEN_URL    = '/oauth/token'
const SCOPE        = 'portfolio:read'

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
  const verifier  = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state     = crypto.randomUUID()

  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('oauth_state', state)

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    scope:                 SCOPE,
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  })
  window.location.href = `${AUTH_URL}?${params}`
}

export async function handleCallback() {
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
    client_id:     CLIENT_ID,
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

  localStorage.setItem('parqet_access_token',  tokens.access_token)
  localStorage.setItem('parqet_refresh_token', tokens.refresh_token || '')
  localStorage.setItem('parqet_expires_at',    String(expiresAt))

  sessionStorage.removeItem('pkce_verifier')
  sessionStorage.removeItem('oauth_state')
  window.history.replaceState({}, '', '/')
  return tokens.access_token
}

export async function getAccessToken() {
  const token        = localStorage.getItem('parqet_access_token')
  const expiresAt    = Number(localStorage.getItem('parqet_expires_at') || 0)
  const refreshToken = localStorage.getItem('parqet_refresh_token')

  if (!token) return null
  if (Date.now() < expiresAt - 60_000) return token
  if (!refreshToken) { logout(); return null }

  try {
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
    })
    const res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error('Refresh failed')
    const tokens = await res.json()
    localStorage.setItem('parqet_access_token', tokens.access_token)
    localStorage.setItem('parqet_expires_at',   String(Date.now() + (tokens.expires_in || 3600) * 1000))
    if (tokens.refresh_token) localStorage.setItem('parqet_refresh_token', tokens.refresh_token)
    return tokens.access_token
  } catch {
    logout()
    return null
  }
}

export function logout() {
  localStorage.removeItem('parqet_access_token')
  localStorage.removeItem('parqet_refresh_token')
  localStorage.removeItem('parqet_expires_at')
  window.location.href = '/'
}

export function isLoggedIn() {
  return !!localStorage.getItem('parqet_access_token')
}