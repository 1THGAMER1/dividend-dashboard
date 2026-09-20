import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ProfilePage({ appUser }) {
  const [imgError, setImgError] = useState(false)

  // Liest alle aktiven Login-Anbieter aus dem Supabase User-Objekt aus
  const getProviders = (user) => {
    if (!user) return []
    const providers =
      user.identities?.map((id) => id.provider) ||
      user.app_metadata?.providers ||
      [user.app_metadata?.provider]

    return [...new Set(providers.filter(Boolean))]
  }

  const activeProviders = getProviders(appUser)
  const avatarUrl = appUser?.user_metadata?.avatar_url

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto', color: '#e0e6f0' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        👤 Mein Profil & Einstellungen
      </h2>

      <div
        style={{
          background: '#161b27',
          border: '1px solid #1e2a3a',
          borderRadius: 16,
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        {/* Profilbild oder Initialen-Avatar */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            overflow: 'hidden',
            background: '#ea580c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            fontWeight: 700,
            color: '#ffffff',
            flexShrink: 0,
          }}
        >
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt="Profil"
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            appUser?.email?.[0]?.toUpperCase() ?? '👤'
          )}
        </div>

        {/* User Details & Provider Badges */}
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
            {appUser?.user_metadata?.full_name || appUser?.user_metadata?.name || 'Benutzer'}
          </h3>
          <p style={{ margin: '4px 0 8px 0', fontSize: 14, color: '#94a3b8' }}>
            {appUser?.email}
          </p>

          {/* Dynamische Provider Badges */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {activeProviders.includes('email') && (
              <span
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontWeight: 500,
                }}
              >
                Anmeldung via E-Mail & Passwort
              </span>
            )}

            {activeProviders.includes('google') && (
              <span
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  color: '#38bdf8',
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                🌐 Google
              </span>
            )}

            {(activeProviders.includes('x') || activeProviders.includes('twitter')) && (
              <span
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  color: '#f8fafc',
                  fontSize: 12,
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                𝕏 Twitter
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
