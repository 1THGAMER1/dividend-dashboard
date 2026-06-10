import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { encrypt } from '../crypto'
import { getPassword } from '../passwordStore'

const REDIRECT_URI = 'https://dividenddashboard.netlify.app/callback'

export default function ParqetSetup({ onDone }) {
  const [clientId, setClientId] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)

  const handleSave = async e => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt')

      const trimmed  = clientId.trim()
      const password = getPassword()

      // Encrypt before storing. If no password is in RAM (edge case), store plaintext —
      // auth.js will auto-migrate on the next login.
      const valueToStore = password
        ? await encrypt(trimmed, password)
        : trimmed

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, parqet_client_id: valueToStore })
      if (error) throw error

      onDone(trimmed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(REDIRECT_URI)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1420' }}>
      <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420, position: 'relative' }}>

        <button onClick={handleSignOut} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#3d5266', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
          Abmelden
        </button>

        <h2 style={{ color: '#e0e6f0', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔑 Parqet verbinden
        </h2>

        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          Um dein Parqet-Konto zu verbinden, benötigst du eine <strong style={{ color: '#93c5fd' }}>Client ID</strong>. Folge diesen Schritten:
        </p>

        <ol style={{ color: '#7a8ba0', fontSize: 13, lineHeight: 2, paddingLeft: 18, marginBottom: 16 }}>
          <li>Gehe zu <a href="https://developer.parqet.com/" target="_blank" rel="noreferrer" style={{ color: '#009991' }}>developer.parqet.com</a></li>
          <li>Erstelle eine neue OAuth App</li>
          <li>Trage als Redirect URI folgendes ein:</li>
        </ol>

        <div style={{ background: '#0f1420', border: '1px solid #2a3a50', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#93c5fd', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', userSelect: 'text' }}>
            {REDIRECT_URI}
          </span>
          <button
            onClick={handleCopy}
            style={{ flexShrink: 0, background: copied ? '#0a2d1a' : '#1e2a3a', border: `1px solid ${copied ? '#14532d' : '#2a3a50'}`, color: copied ? '#86efac' : '#7a8ba0', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {copied ? '✓ Kopiert' : '📋 Kopieren'}
          </button>
        </div>

        <div style={{ background: '#1a2a1a', border: '1px solid #14532d', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>💡</span>
          <p style={{ color: '#86efac', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
            <strong>Wichtig:</strong> Aktiviere beim Erstellen der App unter <em>Scopes</em> mindestens <strong>Leserechte</strong> (z. B. <code style={{ background: '#0f2010', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>read</code>). Ohne diese Berechtigung kann die App keine Daten abrufen.
          </p>
        </div>

        <ol start={4} style={{ color: '#7a8ba0', fontSize: 13, lineHeight: 2, paddingLeft: 18, marginBottom: 24 }}>
          <li>Kopiere die generierte <strong style={{ color: '#93c5fd' }}>Client ID</strong> und füge sie unten ein</li>
        </ol>

        {error && (
          <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="text"
            placeholder="Client ID z.B. abc123def456"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #2a3a50', background: '#0f1420', color: '#e0e6f0', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button type="submit" disabled={loading || !clientId.trim()} style={{ background: loading ? '#1a2233' : '#009991', color: 'white', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
            {loading ? '⟳ Speichern…' : 'Speichern & weiter'}
          </button>
        </form>

        <p style={{ color: '#3d5266', fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          🔒 Deine Client ID wird verschlüsselt gespeichert und ausschließlich für deinen Account verwendet.
        </p>
      </div>
    </div>
  )
}
