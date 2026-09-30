import React from 'react'
import KpiCard from './KpiCard.jsx'

const fmt = n =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
    }).format(n || 0)

export default function PortfolioDashboard({
                                               currentValue,
                                               currentVal,
                                               forecast12m,
                                               holdings = []
                                           }) {
    const displayValue = currentValue ?? currentVal ?? 0

    const getShares = (item) => parseFloat(item.shares) || 0

    const activeHoldings = holdings
        .filter(item => getShares(item) > 0.000001)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    const soldHoldings = holdings
        .filter(item => getShares(item) <= 0.000001)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const getDisplayName = (item) => item.name || item.isin || 'Unbekanntes Asset'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPI KARTEN */}
            <div className="kpi-grid">
                <KpiCard
                    label="Portfolio Marktwert"
                    value={displayValue > 0 ? fmt(displayValue) : '--- €'}
                    color="#60a5fa"
                    sub="Aktueller Gesamtwert"
                />
                <KpiCard
                    label="Aktive Positionen"
                    value={activeHoldings.length.toString()}
                    color="#a78bfa"
                    sub="Alle Assets im Depot"
                />
                <KpiCard
                    label="Progn. Jahresausschüttung"
                    value={fmt(forecast12m?.net ?? 0)}
                    color="#22c55e"
                    sub="Nächste 12 Monate Netto"
                />
            </div>

            {/* 1. SEKTION: AKTIVE BESTÄNDE (Parqet App Style) */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '16px 20px' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
                    💼 Aktive Bestände
                </h3>

                {activeHoldings.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        Keine aktiven Bestände gefunden.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {activeHoldings.map((item, idx) => {
                            const sharesNum = getShares(item)
                            const cost = item.costValue || 0
                            const val = item.value || 0
                            const profit = val - cost
                            const profitPercent = cost > 0 ? (profit / cost) * 100 : 0
                            const isPositive = profit >= 0

                            return (
                                <div key={item.isin || idx} style={{
                                    background: '#10141f',
                                    border: '1px solid #1a2233',
                                    borderRadius: 12,
                                    padding: '14px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 10
                                }}>
                                    {/* Obere Zeile: Name & Aktueller Wert */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                                                {getDisplayName(item)}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <span style={{
                                                    background: '#1e293b',
                                                    color: '#38bdf8',
                                                    fontSize: 10,
                                                    padding: '2px 6px',
                                                    borderRadius: 6,
                                                    fontWeight: 500
                                                }}>
                                                    {item.type || 'Asset'}
                                                </span>
                                                {sharesNum > 0 && (
                                                    <span style={{ fontSize: 12, color: '#64748b' }}>
                                                        {sharesNum.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Anteile
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                                                {val > 0 ? fmt(val) : '—'}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                                                {cost > 0 ? `${isPositive ? '+' : ''}${fmt(profit)} (${isPositive ? '+' : ''}${profitPercent.toFixed(2).replace('.', ',')}%)` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Untere Zeile: Einstandswert dezent */}
                                    {cost > 0 && (
                                        <div style={{
                                            borderTop: '1px solid #1a2233',
                                            paddingTop: 8,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            fontSize: 11,
                                            color: '#64748b'
                                        }}>
                                            <span>Einstandswert</span>
                                            <span style={{ color: '#94a3b8' }}>{fmt(cost)}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* 2. SEKTION: VERKAUFTE POSITIONEN */}
            {soldHoldings.length > 0 && (
                <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '16px 20px', opacity: 0.9 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#94a3b8' }}>
                        📦 Verkaufte & Historische Positionen
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {soldHoldings.map((item, idx) => {
                            const gain = item.realizedGain || 0
                            const isPositive = gain >= 0

                            return (
                                <div key={item.isin || idx} style={{
                                    background: '#10141f',
                                    border: '1px solid #1a2233',
                                    borderRadius: 12,
                                    padding: '12px 16px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>
                                            {getDisplayName(item)}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#556070', marginTop: 2 }}>
                                            Position geschlossen
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444' }}>
                                            {gain !== 0 ? `${isPositive ? '+' : ''}${fmt(gain)}` : '—'}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

        </div>
    )
}