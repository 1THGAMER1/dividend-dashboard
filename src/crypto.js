/**
 * crypto.js — AES-256-GCM encryption for the Parqet Client ID.
 *
 * Key derivation:  PBKDF2(password, 200_000 iterations, SHA-256) → AES-256-GCM key
 * Key caching:     The derived key is exported as JWK and stored in sessionStorage.
 *                  On reload the key is re-imported from JWK — no password needed again.
 *                  The password itself is NEVER written to any storage.
 * Storage format:  "<base64(salt)>.<base64(iv)>.<base64(ciphertext)>"
 */

const ENC = new TextEncoder()
const DEC = new TextDecoder()
const KEY_STORAGE = '_dd_key' // sessionStorage key for the cached JWK

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

// ---------------------------------------------------------------------------
// Key derivation & caching
// ---------------------------------------------------------------------------

/**
 * Derives an AES-256-GCM key from password + salt using PBKDF2.
 * The key is exportable so we can serialise it to sessionStorage.
 */
async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,           // exportable — needed for JWK caching
    ['encrypt', 'decrypt']
  )
}

/**
 * Persists the derived key as a JWK string in sessionStorage.
 * sessionStorage survives page reloads but is cleared when the tab is closed.
 * Only the 256-bit key material is stored — never the password itself.
 */
async function cacheKey(key, salt) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem(KEY_STORAGE, JSON.stringify({ jwk, salt: b64(salt) }))
}

/**
 * Attempts to restore a previously cached key from sessionStorage.
 * Returns null if nothing is cached or if the cache is corrupt.
 */
async function restoreKey() {
  try {
    const raw = sessionStorage.getItem(KEY_STORAGE)
    if (!raw) return null
    const { jwk } = JSON.parse(raw)
    return await crypto.subtle.importKey(
      'jwk', jwk,
      { name: 'AES-GCM' },
      false,          // not exportable after restore (principle of least privilege)
      ['encrypt', 'decrypt']
    )
  } catch {
    sessionStorage.removeItem(KEY_STORAGE)
    return null
  }
}

/**
 * Returns a ready-to-use CryptoKey.
 * • If a key is already cached in sessionStorage, that is re-used (survives reloads).
 * • Otherwise the key is derived from the password and then cached.
 *
 * @param {string} password  — only needed on first call per tab-session
 * @param {Uint8Array} salt  — the salt extracted from the ciphertext being decrypted
 */
export async function getOrDeriveKey(password, salt) {
  // Try the session cache first (covers page reloads without re-entering password).
  const cached = await restoreKey()
  if (cached) return cached

  // Not cached — derive from password and persist for this tab-session.
  if (!password) throw new Error('Kein Passwort verfügbar — bitte neu einloggen.')
  const key = await deriveKey(password, salt)
  await cacheKey(key, salt)
  return key
}

/**
 * Removes the cached key from sessionStorage (call on logout).
 */
export function clearCachedKey() {
  sessionStorage.removeItem(KEY_STORAGE)
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string.
 * Always derives a fresh key with a new random salt so each encryption is unique.
 *
 * @param {string} plaintext  — the Client ID to protect
 * @param {string} password   — the user’s login password
 * @returns {Promise<string>} — "salt.iv.ciphertext" (all base64)
 */
export async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await deriveKey(password, salt)   // fresh key, not cached (write path)
  await cacheKey(key, salt)                       // cache it for subsequent reads
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(plaintext)
  )
  return `${b64(salt)}.${b64(iv)}.${b64(ct)}`
}

/**
 * Decrypts a ciphertext produced by encrypt().
 * Uses the cached key if available; derives it from the password otherwise.
 *
 * @param {string} ciphertext  — "salt.iv.ciphertext" (all base64)
 * @param {string|null} password — only needed if no cached key exists
 * @returns {Promise<string>}  — the original Client ID
 */
export async function decrypt(ciphertext, password) {
  const [saltB64, ivB64, ctB64] = ciphertext.split('.')
  const salt = unb64(saltB64)
  const iv   = unb64(ivB64)
  const ct   = unb64(ctB64)
  const key  = await getOrDeriveKey(password, salt)
  const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return DEC.decode(pt)
}

/**
 * Returns true if the string looks like an encrypted payload (salt.iv.ct).
 * Used to detect legacy plaintext Client IDs for auto-migration.
 */
export function isEncrypted(value) {
  if (!value) return false
  const parts = value.split('.')
  return parts.length === 3 && parts.every(p => p.length > 0)
}
