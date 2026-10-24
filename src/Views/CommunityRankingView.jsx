import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const fmtEur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0)
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toFixed(2).replace('.', ',')} %`)

export default function CommunityRankingView({ currentUserId }) {
    const [ranking, setRanking] = useState([])
    const [loading, setLoading] = useState(true)
    const [sortBy, setSortBy] = useState('dividend') // 'dividend' | 'return'

    useEffect(() => {
        async function fetchRanking() {
            try {
                const { data, error } = await supabase
                    .from('community_dividends')
                    .select('user_id, display_name, annual_dividend, total_return_12m')
                    .limit(50)

                if (error) throw error
                setRanking(data || [])
            } catch (err) {
                console.error('Fehler beim Laden des Rankings:', err.message)
            } finally {
                setLoading(false)
            }
        }
        fetchRanking()
    }, [])

    // Sortierung nach Dividende oder Gesamtrendite
    const sortedRanking = [...ranking].sort((a, b) => {
        if (sortBy === 'dividend') {
            return (b.annual_dividend || 0) - (a.annual_dividend || 0)
        }
        // Nach Rendite: Einträge ohne ermittelbaren Wert ans Ende, nicht als 0% einsortieren
        if (a.total_return_12m == null && b.total_return_12m == null) return 0
        if (a.total_return_12m == null) return 1
        if (b.total_return_12m == null) return -1
        return b.total_return_12m - a.total_return_12m
    })

    if (loading) {
        return <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Lade Community-Ranking…</div>
    }

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, color: '#e0e6f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🏆 Community Ranking
                    </h3>
                    <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                        Anonymisierter Vergleich in der Community.
                    </p>
                </div>

                {/* Umschaltknopf */}
                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                    <button
                        onClick={() => setSortBy('dividend')}
                        style={{
                            background: sortBy === 'dividend' ? '#009991' : 'transparent',
                            color: sortBy === 'dividend' ? '#fff' : '#64748b',
                            border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Nach Dividende (€)
                    </button>
                    <button
                        onClick={() => setSortBy('return')}
                        style={{
                            background: sortBy === 'return' ? '#009991' : 'transparent',
                            color: sortBy === 'return' ? '#fff' : '#64748b',
                            border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Nach 12M IZF (%)
                    </button>
                </div>
            </div>

            {sortedRanking.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', fontSize: 13 }}>
                    Bisher nimmt noch niemand am Ranking teil. Aktiviere die Teilnahme in deinem Profil!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedRanking.map((row, index) => {
                        const isMe = row.user_id === currentUserId
                        const rank = index + 1
                        const medalColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : '#64748b'

                        return (
                            <div
                                key={row.user_id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: isMe ? '#1a2e3b' : '#0f1420',
                                    border: `1px solid ${isMe ? '#38bdf8' : '#1e2a3a'}`,
                                    borderRadius: 10,
                                    padding: '12px 16px',
                                    fontSize: 14,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontWeight: 700, color: medalColor, width: 28, textAlign: 'center' }}>
                                        #{rank}
                                    </span>
                                    <span style={{ fontWeight: isMe ? 700 : 500, color: '#f1f5f9' }}>
                                        {row.display_name} {isMe && <span style={{ fontSize: 10, background: '#38bdf8', color: '#000', padding: '1px 5px', borderRadius: 4, marginLeft: 6 }}>Du</span>}
                                    </span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    {sortBy === 'dividend' ? (
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
                                            {fmtEur(row.annual_dividend)}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 15, fontWeight: 700, color: row.total_return_12m == null ? '#64748b' : '#22c55e' }}>
                                            {row.total_return_12m == null ? '—' : fmtPct(row.total_return_12m)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}