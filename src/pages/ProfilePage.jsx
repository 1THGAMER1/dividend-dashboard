import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import useDividendData from '../hooks/useDividendData'

export default function ProfilePage({ appUser }) {
    const [parqetId, setParqetId] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)
    const [imgError, setImgError] = useState(false)
    const [existingToken, setexistingToken] = useState(null)

    // Holen uns die Portfolio-Daten inklusive enrichedHoldings direkt aus dem Hook
    const { currentValue, holdings, enrichedHoldings, monthly, kpi, byHolding } = useDividendData()

    // Lade bestehende Parqet ID und prüfen, ob bereits ein Share-Token existiert
    useEffect(() => {
        async function loadProfile() {
            if (!appUser) return
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('parqet_client_id, share_token')
                    .eq('id', appUser.id)
                    .maybeSingle()

                if (error) throw error
                if (data?.parqet_client_id) {
                    setParqetId(data.parqet_client_id)
                }
                if (data?.share_token) {
                    setexistingToken(data.share_token)
                }
            } catch (err) {
                console.error('Fehler beim Laden des Profils:', err.message)
            }
        }
        loadProfile()
    }, [appUser])

    // Stabiler Share-Link (wird aktualisiert, aber der Link-Token bleibt immer derselbe!)
    const handleSharePortfolio = async () => {
        try {
            setLoading(tab => true)

            // Entweder den vorhandenen Token nutzen oder einmalig einen neuen generieren
            let token = existingToken
            if (!token) {
                token = Math.random().toString(36).substring(2) + Date.now().toString(36)
                setexistingToken(token)
            }

            const dataToShare = enrichedHoldings && enrichedHoldings.length > 0 ? enrichedHoldings : holdings
            const portfolioPayload = { currentValue, holdings: dataToShare, monthly, kpi, byHolding }

            // 1. In der shared_portfolios Tabelle speichern/aktualisieren (Upsert über share_token)
            const { error: shareError } = await supabase.from('shared_portfolios').upsert([
                {
                    share_token: token,
                    portfolio_data: portfolioPayload,
                    updated_at: new Date().toISOString()
                }
            ], { onConflict: 'share_token' })

            if (shareError) throw shareError

            // 2. Den Token direkt im Profil des Users hinterlegen, damit er dauerhaft erhalten bleibt
            const { error: profileError } = await supabase.from('profiles').upsert([
                {
                    id: appUser.id,
                    share_token: token,
                    parqet_client_id: parqetId.trim()
                }
            ])

            if (profileError) throw profileError

            const shareUrl = `${window.location.origin}/#share/${token}`
            await navigator.clipboard.writeText(shareUrl)
            setMessage({ type: 'success', text: 'Dein fester Share-Link wurde in die Zwischenablage kopiert!' })
        } catch (err) {
            setMessage({ type: 'error', text: 'Fehler beim Erstellen des Links: ' + err.message })
        } finally {
            setLoading(false)
        }
    }

    // Parqet Client ID speichern/aktualisieren
    const handleSaveParqetId = async (e) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            const { error } = await supabase
                .from('profiles')
                .upsert({
                    id: appUser.id,
                    parqet_client_id: parqetId.trim(),
                    updated_at: new Date().toISOString(),
                })

            if (error) throw error
            setMessage({ type: 'success', text: 'Parqet Client ID erfolgreich gespeichert!' })
        } catch (err) {
            setMessage({ type: 'error', text: err.message })
        } finally {
            setLoading(false)
        }
    }

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

            {/* BENUTZER-PROFIL KARTE */}
            <div
                style={{
                    background: '#161b27',
                    border: '1px solid #1e2a3a',
                    borderRadius: 16,
                    padding: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    marginBottom: 24,
                }}
            >
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

                <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
                        {appUser?.user_metadata?.full_name || appUser?.user_metadata?.name || 'Benutzer'}
                    </h3>
                    <p style={{ margin: '4px 0 8px 0', fontSize: 14, color: '#94a3b8' }}>
                        {appUser?.email}
                    </p>
                </div>
            </div>

            {/* PORTFOLIO TEILEN KARTE */}
            <div
                style={{
                    background: '#161b27',
                    border: '1px solid #1e2a3a',
                    borderRadius: 16,
                    padding: 24,
                    marginBottom: 24,
                }}
            >
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔗 Anonymes Portfolio teilen
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94a3b8' }}>
                    Dein fester Nur-Lese-Link. Wenn du ihn kopierst, werden deine aktuellen Portfoliodaten für diesen Link aktualisiert.
                </p>

                {message && (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            marginBottom: 16,
                            background: message.type === 'success' ? '#0a2d1a' : '#2d0a0a',
                            border: `1px solid ${message.type === 'success' ? '#14532d' : '#7f1d1d'}`,
                            color: message.type === 'success' ? '#86efac' : '#fca5a5',
                        }}
                    >
                        {message.type === 'success' ? '✓ ' : '⚠ '}
                        {message.text}
                    </div>
                )}

                <button
                    onClick={handleSharePortfolio}
                    disabled={loading}
                    style={{
                        background: '#009991',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 20px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {loading ? 'Aktualisiere Link…' : 'Share-Link kopieren'}
                </button>
            </div>

            {/* PARQET ANBINDUNG KARTE */}
            <div
                style={{
                    background: '#161b27',
                    border: '1px solid #1e2a3a',
                    borderRadius: 16,
                    padding: 24,
                }}
            >
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔑 Parqet Client ID
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94a3b8' }}>
                    Hinterlege hier deine Parqet Client ID, um dein Portfolio automatisch im Dashboard zu synchronisieren.
                </p>

                <form onSubmit={handleSaveParqetId} style={{ display: 'flex', gap: 10 }}>
                    <input
                        type="text"
                        placeholder="z.B. 60f7b1234a56789012345678"
                        value={parqetId}
                        onChange={(e) => setParqetId(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '10px 14px',
                            borderRadius: 8,
                            border: '1px solid #2a3a50',
                            background: '#0f1420',
                            color: '#e0e6f0',
                            fontSize: 14,
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            background: loading ? '#1a2233' : '#1e3a5f',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '0 20px',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {loading ? '⟳' : 'Speichern'}
                    </button>
                </form>
            </div>
        </div>
    )
}