import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import useDividendData from '../hooks/useDividendData'
import { computePortfolioXRay } from '../utils/portfolioXray'
import { loadEtfHoldingsMapFor } from '../utils/etfHoldingsStore'
import { getClientId, saveClientId, startOAuthFlow, isLoggedIn, disconnectParqet } from '../auth'

const RANDOM_NAMES = [
    'DividendHero', 'ZinseszinsKing', 'CashflowCaptain', 'DividendenFuchs',
    'PassivesEinkommen', 'AktienHai', 'YieldJunkie', 'SparplanProfi', 'VermögensBuilder'
]

// XIRR kann bei sehr kurzer Historie oder extremen Cashflows unrealistisch ausschlagen.
// Für das öffentliche Ranking werden solche Ausreißer verworfen statt angezeigt.
function clampReturn(value) {
    if (value == null || !Number.isFinite(value)) return null
    if (value < -95 || value > 500) return null
    return +value.toFixed(2)
}

export default function ProfilePage({ appUser, onNavigate }) {
    const [parqetId, setParqetId] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState(null)
    const [imgError, setImgError] = useState(false)
    const [existingToken, setexistingToken] = useState(null)
    const [parqetConnected, setParqetConnected] = useState(false)

    // Community Ranking States
    const [participateRanking, setParticipateRanking] = useState(false)
    const [displayName, setDisplayName] = useState('')
    const [newsletterActive, setNewsletterActive] = useState(true)

    // Holen uns die Portfolio-Daten inklusive enrichedHoldings direkt aus dem Hook
    const { currentValue, holdings, enrichedHoldings, monthly, kpi, byHolding, xirr12m } = useDividendData()

    const totalReturn12m = clampReturn(xirr12m)

    // Lade bestehende Profildaten (Parqet ID, Share-Token, Newsletter sowie Ranking-Opt-in)
    useEffect(() => {
        async function loadProfile() {
            if (!appUser) return
            try {
                setParqetConnected(isLoggedIn())

                const { data, error } = await supabase
                    .from('profiles')
                    .select('parqet_client_id, share_token, newsletter_active')
                    .eq('id', appUser.id)
                    .maybeSingle()

                if (error) throw error
                const decrypted = await getClientId().catch(() => null)
                if (decrypted) setParqetId(decrypted)
                if (data?.share_token) setexistingToken(data.share_token)
                if (data?.newsletter_active !== undefined && data?.newsletter_active !== null) {
                    setNewsletterActive(data.newsletter_active)
                }

                // Prüfen ob bereits im Community Ranking eingetragen
                const { data: rankData } = await supabase
                    .from('community_dividends')
                    .select('display_name')
                    .eq('user_id', appUser.id)
                    .maybeSingle()

                if (rankData) {
                    setParticipateRanking(true)
                    setDisplayName(rankData.display_name || '')
                } else {
                    const randomDefault = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 900 + 100)
                    setDisplayName(randomDefault)
                }
            } catch (err) {
                console.error('Fehler beim Laden des Profils:', err.message)
            }
        }
        loadProfile()
    }, [appUser])

    // Automatischer Abgleich der Dividenden beim Laden der Profilseite
    useEffect(() => {
        async function autoUpdateRanking() {
            if (!appUser || !participateRanking) return

            const annualDividend = kpi?.all?.net ||
                kpi?.['12m']?.net ||
                Object.values(monthly || {}).flatMap(m => m).reduce((a, b) => a + (b || 0), 0) || 0
            if (annualDividend <= 0) return

            try {
                await supabase
                    .from('community_dividends')
                    .upsert({
                        user_id: appUser.id,
                        display_name: displayName.trim() || 'Anonym',
                        annual_dividend: annualDividend,
                        total_return_12m: totalReturn12m,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' })
            } catch (err) {
                console.error('Automatisches Aktualisieren des Rankings fehlgeschlagen:', err)
            }
        }
        autoUpdateRanking()
    }, [appUser, participateRanking, kpi, monthly, displayName, totalReturn12m])

    const generateRandomName = () => {
        const randomPrefix = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
        const randomNum = Math.floor(Math.random() * 900 + 100)
        setDisplayName(`${randomPrefix}${randomNum}`)
    }

    // Speichern der Community-Ranking Einstellungen
    const handleSaveRankingSettings = async () => {
        setLoading(true)
        setMessage(null)

        try {
            if (participateRanking) {
                const annualDividend = kpi?.all?.net ||
                    kpi?.['12m']?.net ||
                    Object.values(monthly || {}).flatMap(m => m).reduce((a, b) => a + (b || 0), 0) || 0

                const { error } = await supabase
                    .from('community_dividends')
                    .upsert({
                        user_id: appUser.id,
                        display_name: displayName.trim() || 'Anonym',
                        annual_dividend: annualDividend,
                        total_return_12m: totalReturn12m,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' })

                if (error) throw error
                setMessage({ type: 'success', text: 'Community-Ranking Einstellungen erfolgreich gespeichert!' })
            } else {
                const { error } = await supabase
                    .from('community_dividends')
                    .delete()
                    .eq('user_id', appUser.id)

                if (error) throw error
                setMessage({ type: 'success', text: 'Du wurdest aus dem Community-Ranking entfernt.' })
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Fehler beim Speichern: ' + err.message })
        } finally {
            setLoading(false)
        }
    }

    const handleToggleNewsletter = async (active) => {
        setNewsletterActive(active)
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    newsletter_active: active
                })
                .eq('id', appUser.id)

            if (error) throw error
            setMessage({
                type: 'success',
                text: active ? 'Wöchentlicher Portfolio-Report aktiviert!' : 'Portfolio-Report deaktiviert.'
            })
        } catch (err) {
            setMessage({ type: 'error', text: 'Fehler beim Speichern: ' + err.message })
        }
    }

    const handleSharePortfolio = async () => {
        try {
            setLoading(true)
            setMessage(null)

            if (!enrichedHoldings || enrichedHoldings.length === 0) {
                setMessage({ type: 'error', text: 'Bitte warte einen Moment, bis die Daten komplett geladen sind.' })
                return
            }

            const token = existingToken || crypto.randomUUID()

            let xray = null
            try {
                const xrayBase = enrichedHoldings?.length ? enrichedHoldings : holdings
                const etfMap = await loadEtfHoldingsMapFor(xrayBase)
                if (Object.keys(etfMap).length) {
                    xray = computePortfolioXRay(etfMap, xrayBase, currentValue)
                        .map(i => [i.Name, i.Country, +i.Weight.toFixed(4), i.Sector ?? null])
                        .filter(r => r[2] > 0)
                        .slice(0, 6000)
                }
            } catch (xrayErr) {
                console.warn('X-Ray konnte nicht berechnet werden:', xrayErr)
            }

            const portfolioPayload = {
                currentValue,
                holdings: enrichedHoldings,
                monthly,
                kpi,
                byHolding,
                ...(xray ? { xray } : {})
            }

            const { data: saved, error: shareError } = await supabase
                .from('shared_portfolios')
                .upsert(
                    {
                        share_token: token,
                        user_id: appUser.id,
                        portfolio_data: portfolioPayload,
                        updated_at: new Date().toISOString()
                    },
                    { onConflict: 'share_token' }
                )
                .select('updated_at')
            if (shareError) throw shareError

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({ id: appUser.id, share_token: token, parqet_client_id: parqetId.trim() })
            if (profileError) throw profileError

            setexistingToken(token)

            const shareUrl = `${window.location.origin}/#share/${token}`
            try {
                await navigator.clipboard.writeText(shareUrl)
                setMessage({ type: 'success', text: 'Portfolio aktualisiert & Link in Zwischenablage kopiert!' })
            } catch {
                setMessage({ type: 'success', text: `Portfolio erfolgreich aktualisiert!` })
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Fehler: ' + err.message })
        } finally {
            setLoading(false)
        }
    }

    const handleSaveParqetId = async (e) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            await saveClientId(parqetId)
            setMessage({ type: 'success', text: 'Neue Parqet Client ID erfolgreich gespeichert!' })
        } catch (err) {
            setMessage({ type: 'error', text: err.message })
        } finally {
            setLoading(false)
        }
    }

    const avatarUrl = appUser?.user_metadata?.avatar_url

    return (
        <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto', color: '#e0e6f0' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                👤 Mein Profil & Einstellungen
            </h2>

            {/* BENUTZER-PROFIL KARTE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', background: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#ffffff', flexShrink: 0 }}>
                    {avatarUrl && !imgError ? (
                        <img src={avatarUrl} alt="Profil" onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        appUser?.email?.[0]?.toUpperCase() ?? '👤'
                    )}
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
                        {appUser?.user_metadata?.full_name || appUser?.user_metadata?.name || 'Benutzer'}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#94a3b8' }}>{appUser?.email}</p>
                </div>
            </div>

            {message && (
                <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 24, background: message.type === 'success' ? '#0a2d1a' : '#2d0a0a', border: `1px solid ${message.type === 'success' ? '#14532d' : '#7f1d1d'}`, color: message.type === 'success' ? '#86efac' : '#fca5a5' }}>
                    {message.type === 'success' ? '✓ ' : '⚠ '}{message.text}
                </div>
            )}

            {/* COMMUNITY RANKING KARTE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🏆 Anonymisiertes Community-Ranking
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
                    Nimm am anonymen Bestenvergleich teil und vergleiche deine jährlichen Dividenden mit anderen Nutzern.
                </p>

                <div style={{ background: '#0f1420', border: '1px solid #2a3a50', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 12, color: '#cbd5e1', lineHeight: 1.4 }}>
                    <strong style={{ color: '#38bdf8' }}>Was wird geteilt?</strong> Es wird ausschließlich dein gewählter <strong>Benutzername</strong>, die gerundete <strong>Summe deiner jährlichen Dividenden</strong> sowie deine <strong>12M Gesamtrendite (IZF)</strong> veröffentlicht. Es werden niemals deine E-Mail-Adresse, dein Realname, einzelne Aktienpositionen oder Kontodaten preisgegeben.
                </div>

                {totalReturn12m == null && participateRanking && (
                    <div style={{ background: '#1a1300', border: '1px solid #4d3a00', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: '#fbbf24' }}>
                        ⚠ Deine 12M-Rendite konnte noch nicht ermittelt werden (z. B. zu kurze Historie). Dividenden werden trotzdem gemeldet.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                        <input
                            type="checkbox"
                            checked={participateRanking}
                            onChange={(e) => setParticipateRanking(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#009991', cursor: 'pointer' }}
                        />
                        Am Community-Ranking teilnehmen
                    </label>

                    {participateRanking && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 400 }}>
                            <label style={{ fontSize: 12, color: '#94a3b8' }}>Dein anonymer Anzeigename:</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="z.B. DividendHero"
                                    maxLength={30}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #2a3a50', background: '#0f1420', color: '#e0e6f0', fontSize: 13 }}
                                />
                                <button
                                    type="button"
                                    onClick={generateRandomName}
                                    style={{ background: '#1e293b', color: '#38bdf8', border: '1px solid #2a3a50', borderRadius: 8, padding: '0 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                                    title="Zufälligen Namen generieren"
                                >
                                    🎲 Zufall
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <button
                        onClick={handleSaveRankingSettings}
                        disabled={loading}
                        style={{
                            background: '#1e3a5f',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {loading ? 'Speichere...' : 'Ranking-Einstellungen speichern'}
                    </button>

                    {participateRanking && (
                        <button
                            onClick={() => {
                                if (typeof onNavigate === 'function') {
                                    onNavigate('community-ranking')
                                } else {
                                    window.location.hash = 'community-ranking'
                                }
                            }}
                            style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13 }}
                        >
                            Zum Community-Ranking →
                        </button>
                    )}
                </div>
            </div>

            {/* WÖCHENTLICHER NEWSLETTER KARTE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                            📧 Wöchentlicher Portfolio-Report
                        </h3>
                        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8', lineHeight: 1.5, maxWidth: 500 }}>
                            Erhalte jeden Montagmorgen deine 7-Tage-Performance, Wochen-Gewinner und die neuesten Dividenden direkt in dein Postfach.
                        </p>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: '#0f1420', padding: '8px 14px', borderRadius: 10, border: '1px solid #2a3a50' }}>
                        <input
                            type="checkbox"
                            checked={newsletterActive}
                            onChange={(e) => handleToggleNewsletter(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#009991', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: newsletterActive ? '#22c55e' : '#64748b' }}>
                            {newsletterActive ? 'Aktiviert' : 'Deaktiviert'}
                        </span>
                    </label>
                </div>
            </div>

            {/* PORTFOLIO TEILEN KARTE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔗 Anonymes Portfolio teilen
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94a3b8' }}>
                    Dein fester Nur-Lese-Link. Über den Button unten aktualisierst du dein geteiltes Portfolio.
                </p>

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
                    {loading ? 'Aktualisiere…' : 'Share-Link kopieren / aktualisieren'}
                </button>
            </div>

            {/* PARQET ANBINDUNG KARTE */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔗 Parqet Anbindung
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94a3b8' }}>
                    Verbinde dein Parqet-Konto, um dein Portfolio automatisch zu synchronisieren.
                </p>

                {parqetConnected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ background: '#0a2d1a', border: '1px solid #14532d', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 16 }}>✓</span>
                            <span style={{ color: '#86efac', fontSize: 13, fontWeight: 600 }}>Parqet ist verbunden</span>
                        </div>
                        <button
                            onClick={async () => {
                                await disconnectParqet()
                                setParqetConnected(false)
                                setMessage({ type: 'success', text: 'Parqet-Verbindung wurde getrennt.' })
                            }}
                            style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}
                        >
                            Verbindung trennen
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <form onSubmit={handleSaveParqetId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <label style={{ fontSize: 12, color: '#94a3b8' }}>Parqet Client ID:</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <input
                                    type="text"
                                    placeholder="z.B. 60f7b1234a56789012345678"
                                    value={parqetId}
                                    onChange={(e) => setParqetId(e.target.value)}
                                    style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #2a3a50', background: '#0f1420', color: '#e0e6f0', fontSize: 14 }}
                                />
                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{ background: loading ? '#1a2233' : '#1e3a5f', color: '#ffffff', border: 'none', borderRadius: 8, padding: '0 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {loading ? '⟳' : 'Speichern'}
                                </button>
                            </div>
                        </form>

                        <button
                            onClick={() => {
                                startOAuthFlow()
                            }}
                            disabled={!parqetId.trim()}
                            style={{
                                background: parqetId.trim() ? '#009991' : '#1a2233',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 20px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: parqetId.trim() ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8
                            }}
                        >
                            <span>🔗</span>
                            <span>Mit Parqet verbinden</span>
                        </button>

                        <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>
                            💡 Trage zuerst deine Client ID ein und speichere sie. Danach kannst du dich mit Parqet verbinden.
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}