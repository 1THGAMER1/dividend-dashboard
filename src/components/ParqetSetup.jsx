import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ParqetSetup({ onDone }) {
  const [clientId, setClientId] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const handleSave = async e => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Nicht eingeloggt')

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, parqet_client_id: clientId.trim() })
      if (error) throw error

      onDone(clientId.trim())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f1420',
    }}>
      <div style={{
        background: '#161b27', border: '1px solid #1e2a3a',
        borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420,
        position: 'relative',
      }}>

        <button
          onClick={handleSignOut}
          style={{
            position: 'absolute', top: 14, right: 16,
            background: 'none', border: 'none',
            color: '#3d5266', fontSize: 11, cursor: 'pointer',
            textDecoration: 'underline', padding: 0,
          }}
        >
          Abmelden
        </button>

        <h2 style={{ color: '#e0e6f0', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔑 Parqet verbinden
        </h2>
        {/* Beschreibungstext */}
<p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
  Um dein Parqet-Konto zu verbinden, benötigst du eine <strong style={{ color: '#93c5fd' }}>Client ID</strong>.
  Folge diesen Schritten:
</p>

<ol style={{ color: '#7a8ba0', fontSize: 13, lineHeight: 2, paddingLeft: 18, marginBottom: 20 }}>
  <li>Gehe zu <a href="https://app.parqet.com/settings/developer" target="_blank" rel="noreferrer" style={{ color: '#009991' }}>app.parqet.com → Einstellungen → Entwickler</a></li>
  <li>Erstelle eine neue OAuth App</li>
  <li>Trage als Redirect URI folgendes ein:</li>
</ol>

{/* Kopierbarer Block */}
<div
  onClick={() => navigator.clipboard.writeText('https://dividenddashboard.netlify.app/callback')}
  title="Klicken zum Kopieren"
  style={{
    background: '#0f1420',
    border: '1px solid #2a3a50',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: '#93c5fd',
    fontFamily: 'monospace',
    cursor: 'pointer',
    marginBottom: 20,
    userSelect: 'all',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }}
>
  https://dividenddashboard.netlify.app/callback
  <span style={{ color: '#3d5266', fontSize: 11 }}>📋 Kopieren</span>
</div>

<ol start={4} style={{ color: '#7a8ba0', fontSize: 13, lineHeight: 2, paddingLeft: 18, marginBottom: 24 }}>
  <li>Kopiere die generierte <strong style={{ color: '#93c5fd' }}>Client ID</strong> und füge sie unten ein</li>
</ol>
      <p>
          Deine Daten werden sicher gespeichert und nur für deinen Account verwendet.
        </p>

        {error && (
          <div style={{
            background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
            padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="text"
            placeholder="ClientID z.B. abc123def456"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: '1px solid #2a3a50', background: '#0f1420',
              color: '#e0e6f0', fontSize: 14, boxSizing: 'border-box',
            }}
          />
          <button type="submit" disabled={loading || !clientId.trim()} style={{
            background: loading ? '#1a2233' : '#009991', color: 'white',
            border: 'none', borderRadius: 8, padding: '11px 0',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            {loading ? '⟳ Speichern…' : 'Speichern & weiter'}
          </button>
        </form>
      </div>
    </div>
  )
}
