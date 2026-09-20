import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ParqetSetup({ user, onComplete }) {
  const [clientId, setClientId] = useState('')
  const [loading, setLoading]  = useState(false)
  const [error, setError]      = useState(null)

  const handleSave = async e => {
    e.preventDefault()
    if (!clientId.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Speichere die parqet_client_id in deiner 'profiles' Tabelle
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          parqet_client_id: clientId.trim(),
          updated_at: new Date().toISOString(),
        })

      if (error) throw error

      // Onboarding abgeschlossen: Übergib die ID an die Haupt-App
      onComplete(clientId.trim())
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
        <h1 style={{ color: '#e0e6f0', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          🚀 Parqet verbinden
        </h1>
        <p style={{ color: '#7a8ba0', fontSize: 14, marginBottom: 24, lineHeight: '1.5' }}>
          Bitte gib deine Parqet Client ID ein, um dein Portfolio und deine Dividenden automatisch zu laden.
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
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: 12, marginBottom: 6 }}>
              Parqet Client ID
            </label>
            <input
              type="text"
              placeholder="z.B. c1a2b3c4-d5e6-..."
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #2a3a50', background: '#0f1420',
                color: '#e0e6f0', fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !clientId.trim()}
            style={{
              background: loading ? '#1a2233' : '#009991', color: 'white',
              border: 'none', borderRadius: 8, padding: '12px 0',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 8,
            }}
          >
            {loading ? '⟳ Speichere…' : 'Konto verlinken'}
          </button>
        </form>
      </div>
    </div>
  )
}
