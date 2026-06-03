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

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f1420',
    }}>
      <div style={{
        background: '#161b27', border: '1px solid #1e2a3a',
        borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 420,
      }}>
        <h2 style={{ color: '#e0e6f0', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔑 Parqet verbinden
        </h2>
        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 24 }}>
          Gib deine Parqet <strong style={{ color: '#93c5fd' }}>Client ID</strong> ein.
          Diese findest du in den Parqet-Entwicklereinstellungen unter{' '}
          <a href="https://app.parqet.com" target="_blank" rel="noreferrer"
             style={{ color: '#009991' }}>app.parqet.com</a>.
          Sie wird sicher gespeichert und nur für deinen Account verwendet.
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
            placeholder="z.B. abc123def456"
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
