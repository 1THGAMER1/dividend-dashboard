/**
 * crypto.js — AES-256-GCM encryption for the Parqet Client ID.
 *
 * Key derivation:  PBKDF2(password, userId, 200_000 iterations, SHA-256) → AES-256-GCM key
 * Storage format:  "<base64(salt)>.<base64(iv)>.<base64(ciphertext)>"
 *
 * The password never leaves the browser. Only the ciphertext is stored in Supabase.
 */

const ENC = new TextEncoder()
const DEC = new TextDecoder()

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0))
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', ENC.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a plaintext string.
 * @param {string} plaintext   — the Client ID to protect
 * @param {string} password    — the user's login password (in RAM only)
 * @returns {Promise<string>}  — "salt.iv.ciphertext" (all base64)
 */
export async function encrypt(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await deriveKey(password, salt)
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    ENC.encode(plaintext)
  )
  return `${b64(salt)}.${b64(iv)}.${b64(ct)}`
}

/**
 * Decrypts a ciphertext produced by encrypt().
 * @param {string} ciphertext  — "salt.iv.ciphertext" (all base64)
 * @param {string} password    — the user's login password (in RAM only)
 * @returns {Promise<string>}  — the original Client ID
 */
export async function decrypt(ciphertext, password) {
  const [saltB64, ivB64, ctB64] = ciphertext.split('.')
  const salt = unb64(saltB64)
  const iv   = unb64(ivB64)
  const ct   = unb64(ctB64)
  const key  = await deriveKey(password, salt)
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
