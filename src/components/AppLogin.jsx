import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { storePassword } from '../passwordStore'

export default function AppLogin() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState('login') // 'login' | 'register' | 'forgot'
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [info,     setInfo]     = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Store password in RAM so auth.js can derive the AES key for the Client ID.
        // Never written to localStorage / sessionStorage / cookies.
        storePassword(password)
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo('Registrierung erfolgreich! Bitte bestätige deine E-Mail und logge dich dann ein.')
        setMode('login')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setInfo('E-Mail gesendet! Bitte prüfe deinen Posteingang und klicke auf den Link zum Zurücksetzen.')
        setMode('login')
      }
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

  const linkBtn = (onClick, label) => (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', color: '#009991',
      cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0,
    }}>{label}</button>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f1420',
    }}>
      <div style={{
        background: '#161b27', border: '1px solid #1e2a3a',
        borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400,
      }}>
        <h1 style={{ color: '#e0e6f0', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          📈 Dividenden Dashboard
        </h1>
        <p style={{ color: '#7a8ba0', fontSize: 13, marginBottom: 28 }}>
          {mode === 'login'    && 'Melde dich an um fortzufahren.'}
          {mode === 'register' && 'Erstelle einen neuen Account.'}
          {mode === 'forgot'   && 'Gib deine E-Mail ein um dein Passwort zurückzusetzen.'}
        </p>

        {error && (
          <div style={{
            background: '#2d0a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
            padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          }}>
            ⚠ {error}
          </div>
        )}
        {info && (
          <div style={{
            background: '#0a2d1a', border: '1px solid #14532d', color: '#86efac',
            padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          }}>
            ✓ {info}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="email" placeholder="E-Mail" value={email}
            onChange={e => setEmail(e.target.value)} required style={inputStyle}
          />
          {mode !== 'forgot' && (
            <input
              type="password" placeholder="Passwort" value={password}
              onChange={e => setPassword(e.target.value)} required style={inputStyle}
            />
          )}
          <button type="submit" disabled={loading} style={{
            background: loading ? '#1a2233' : '#009991', color: 'white',
            border: 'none', borderRadius: 8, padding: '11px 0',
            fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4,
          }}>
            {loading ? '⟳ Bitte warten…'
              : mode === 'login'    ? 'Anmelden'
              : mode === 'register' ? 'Registrieren'
              : 'Zurücksetzen-Link senden'}
          </button>
        </form>

        {mode === 'login' && (
          <p style={{ textAlign: 'right', marginTop: 10, marginBottom: 0 }}>
            {linkBtn(() => { setMode('forgot'); setError(null); setInfo(null) }, 'Passwort vergessen?')}
          </p>
        )}

        <p style={{ color: '#7a8ba0', fontSize: 13, textAlign: 'center', marginTop: 16 }}>
          {mode === 'login' && (
            <>Noch kein Account?{' '}{linkBtn(() => { setMode('register'); setError(null); setInfo(null) }, 'Registrieren')}</>
          )}
          {(mode === 'register' || mode === 'forgot') && (
            <>Bereits registriert?{' '}{linkBtn(() => { setMode('login'); setError(null); setInfo(null) }, 'Anmelden')}</>
          )}
        </p>
      </div>
    </div>
  )
}
