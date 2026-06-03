import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export default function ResetPassword() {
  const [password,     setPassword]     = useState('')
  const [password2,    setPassword2]    = useState('')
  const [error,        setError]        = useState(null)
  const [info,         setInfo]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [checking,     setChecking]     = useState(true)

  useEffect(() => {
    // Supabase liest den Token automatisch aus dem URL-Hash
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true)
        setChecking(false)
      }
    })

    // Fallback: Session bereits vorhanden
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setValidSession(true)
      }
      setChecking(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)

    if (password !== password2) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }
    if (password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setInfo('Passwort erfolgreich geändert! Du wirst weitergeleitet…')
      setTimeout(() => { window.location.href = '/' }, 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #2a3a50', background: '#0f1420',
    color: '#e0e6f0', fontSize: 14, boxSizing: 'border-box',
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1420' }}>
      <p style={{ color: '#7a8ba0' }}>⟳ Wird überprüft…</p>
    </div>
  )

  if (!validSession) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1420' }}>
      <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '40px 36px', maxWidth: 400, width: '100%' }}>
        <h2 style={{ color: '#fca5a5', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>⚠ Ungültiger Link</h2>
        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 20 }}>
          Dieser Link ist abgelaufen oder ungültig. Bitte fordere einen neuen Zurücksetzen-Link an.
        </p>
        <button onClick={() => window.location.href = '/'} style={{
          background: '#009991', color: 'white', border: 'none', borderRadius: 8,
          padding: '11px 0', width: '100%', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>
          Zurück zum Login
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1420' }}>
      <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '40px 36px', maxWidth: 400, width: '100%' }}>
        <h2 style={{ color: '#e0e6f0', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔒 Neues Passwort setzen
        </h2>
        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 24 }}>
          Wähle ein neues sicheres Passwort für deinen Account.
        </p>

        {error && (
          <div style={{ background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ⚠ {error}
          </div>
        )}
        {info && (
          <div style={{ background: '#0a2d1a', border: '1px solid #14532d', color: '#86efac', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            ✓ {info}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="password" placeholder="Neues Passwort" value={password}
            onChange={e => setPassword(e.target.value)} required style={inputStyle}
          />
          <input
            type="password" placeholder="Passwort wiederholen" value={password2}
            onChange={e => setPassword2(e.target.value)} required style={inputStyle}
          />
          <button type="submit" disabled={loading} style={{
            background: loading ? '#1a2233' : '#009991', color: 'white',
            border: 'none', borderRadius: 8, padding: '11px 0',
            fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4,
          }}>
            {loading ? '⟳ Bitte warten…' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    </div>
  )
}
