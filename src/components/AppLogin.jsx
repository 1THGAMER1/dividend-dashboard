import { useState } from 'react'
import { supabase } from '../supabaseClient'

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
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo('Registrierung erfolgreich! Bitte prüfe deine E-Mails zum Bestätigen.')
        setMode('login')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setInfo('E-Mail gesendet! Bitte prüfe deinen Posteingang.')
        setMode('login')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
    } catch (err) {
      setError(err.message)
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #2a3a50', background: '#0f1420',
    color: '#e0e6f0', fontSize: 14, boxSizing: 'border-box',
  }

  const linkBtn = (onClick, label) => (
    <button type="button" onClick={onClick} style={{
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

        {mode !== 'forgot' && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', margin: '20px 0',
              color: '#4a5a70', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px'
            }}>
              <div style={{ flex: 1, height: '1px', background: '#2a3a50' }}></div>
              <span style={{ padding: '0 10px' }}>oder</span>
              <div style={{ flex: 1, height: '1px', background: '#2a3a50' }}></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '10px 0', borderRadius: 8, border: '1px solid #2a3a50',
                background: '#0f1420', color: '#e0e6f0', fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Weiter mit Google
            </button>
          </>
        )}

        {mode === 'login' && (
          <p style={{ textAlign: 'right', marginTop: 14, marginBottom: 0 }}>
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
