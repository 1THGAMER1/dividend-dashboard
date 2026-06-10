/**
 * passwordStore.js — ephemeral in-RAM password store.
 *
 * The user's password is held here only for the duration of the browser session
 * (never written to localStorage / sessionStorage / cookies).
 * It is needed to derive the AES key for encrypting / decrypting the Client ID.
 */

let _password = null

export function storePassword(pw) {
  _password = pw
}

export function getPassword() {
  return _password
}

export function clearPassword() {
  _password = null
}
