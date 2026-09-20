import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function ProfilePage({ appUser, onParqetUpdated }) {
  const [clientId, setClientId] = useState('')
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState({ type: '', text: '' })

  useEffect(() => {
    async function loadProfile() {
      if (!appUser?.id) return
      const { data } = await supabase
        .from('profiles')
        .select('parqet_client_id')
        .eq('id', appUser.id)
        .single()

      if (data?.parqet_client_id) {
        setClientId(data.parqet_client_id)
      }
    }
    loadProfile()
  }, [appUser])

  const handleSaveParqet = async e => {
    e.preventDefault()
    setLoading(true)
    setMsg({ type: '', text: '' })

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: appUser.id,
          parqet_client_id: clientId.trim(),
          updated_at: new Date().toISOString(),
        })

      if (error) throw error

      setMsg({ type: 'success', text: 'Parqet Client ID erfolgreich aktualisiert!' })
      if (onParqetUpdated) onParqetUpdated()
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const provider = appUser?.app_metadata?.provider === 'google' ? 'Google' : 'E-Mail & Passwort'
  const avatarUrl = appUser?.user_metadata?.avatar_url
  const fullName  = appUser?.user_metadata?.full_name || 'Benutzer'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '30px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e0e6f0', marginBottom: 20 }}>
        👤 Mein Profil & Einstellungen
      </h1>

      {msg.text && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13,
          background: msg.type === 'error' ? '#2d0a0a' : '#0a2d1a',
          border: `1px solid ${msg.type === 'error' ? '#7f1d1d' : '#14532d'}`,
          color: msg.type === 'error' ? '#fca5a5' : '#86efac',
        }}>
          {msg.type === 'error' ? '⚠ ' : '✓ '}{msg.text}
        </div>
      )}

      {/* Profile Card */}
      <div style={{
        background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12,
        padding: 24, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#1e2a3a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', border: '2px solid #009991', flexShrink: 0,
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, color: '#93c5fd' }}>
              {appUser?.email?.[0]?.toUpperCase() ?? '👤'}
            </span>
          )}
        </div>
        <div>
          <h2 style={{ color: '#e0e6f0', fontSize: 18, margin: 0 }}>{fullName}</h2>
          <p style={{ color: '#7a8ba0', fontSize: 13, margin: '4px 0 0' }}>{appUser?.email}</p>
          <span style={{
            display: 'inline-block', marginTop: 8, padding: '2px 8px', borderRadius: 12,
            background: '#0f1420', border: '1px solid #2a3a50', color: '#93c5fd', fontSize: 11,
          }}>
            Anmeldung via {provider}
          </span>
        </div>
      </div>

      {/* Parqet Settings */}
      <div style={{
        background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24,
      }}>
        <h3 style={{ color: '#e0e6f0', fontSize: 16, margin: '0 0 8px' }}>
          🔗 Parqet Anbindung
        </h3>
        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 16 }}>
          Hier kannst du deine verknüpfte Parqet Client ID ansehen oder ändern.
        </p>

        <form onSubmit={handleSaveParqet} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: 12, marginBottom: 6 }}>
              Parqet Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="c1a2b3c4-d5e6-..."
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
            disabled={loading}
            style={{
              alignSelf: 'flex-start', background: loading ? '#1a2233' : '#009991',
              color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4,
            }}
          >
            {loading ? 'Speichere…' : 'Änderungen speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}
