import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const fmt = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0)

export default function CommunityRankingView({ currentUserId }) {
    const [ranking, setRanking] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchRanking() {
            try {
                const { data, error } = await supabase
                    .from('community_dividends')
                    .select('user_id, display_name, annual_dividend')
                    .order('annual_dividend', { ascending: false })
                    .limit(50) // Top 50 anzeigen

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

    if (loading) {
        return <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Lade Community-Ranking…</div>
    }

    return (
        <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 24, color: '#e0e6f0' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                🏆 Community Dividenden-Ranking
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px 0' }}>
                Anonymisierter Vergleich der jährlichen Ausschüttungen in der Community.
            </p>

            {ranking.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', fontSize: 13 }}>
                    Bisher nimmt noch niemand am Ranking teil. Aktiviere die Teilnahme in deinem Profil!
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ranking.map((row, index) => {
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
                                <span style={{ fontWeight: 700, color: '#22c55e' }}>
                                    {fmt(row.annual_dividend)} / Jahr
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}