import React, { useEffect, useState } from 'react'
import KpiCard from './KpiCard.jsx'
import PortfolioPerformanceChart from './PortfolioPerformanceChart.jsx'
import { fetchPositionPerformance } from '../api.js'

const fmt = (n) => {
    const val = Number(n || 0)
    const options = {
        style: 'currency',
        currency: 'EUR',
    }
    if (Math.abs(val) >= 10000) {
        options.minimumFractionDigits = 0
        options.maximumFractionDigits = 0
    }

    return new Intl.NumberFormat('de-DE', options).format(val)
}
function Stat({ label, value, color = '#cbd5e1' }) {
    return (
        <div style={{ background: '#0c1019', border: '1px solid #1a2233', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
        </div>
    )
}

export default function PortfolioDashboard({
                                               currentValue,
                                               currentVal,
                                               forecast12m,
                                               holdings = [],
                                               performanceSeries
                                           }) {
    const displayValue = currentValue ?? currentVal ?? 0
    const [range, setRange] = useState('1Y')
    const [perfByRange, setPerfByRange] = useState({})
    const [portfolioPerfByRange, setPortfolioPerfByRange] = useState({})

    useEffect(() => {
        if (perfByRange[range] && portfolioPerfByRange[range]) return
        let cancelled = false
        fetchPositionPerformance(range, summary => {
            if (!cancelled) {
                setPortfolioPerfByRange(prev => ({ ...prev, [range]: summary }))
            }
        })
            .then(map => { if (!cancelled) setPerfByRange(prev => ({ ...prev, [range]: map })) })
            .catch(e => {
                console.warn('[Positionen] Zeitraum-Abruf fehlgeschlagen:', e.message)
                if (!cancelled) setPerfByRange(prev => ({ ...prev, [range]: {} }))
            })
        return () => { cancelled = true }
    }, [range, perfByRange, portfolioPerfByRange])

    const getShares = (item) => parseFloat(item.shares) || 0

    const activeHoldings = holdings
        .filter(item => getShares(item) > 0.000001)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    const soldHoldings = holdings
        .filter(item => getShares(item) <= 0.000001)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const getDisplayName = (item) => item.name || item.isin || 'Unbekanntes Asset'
    console.log('[Dashboard]', range,
        '| Einträge:', Object.keys(perfByRange[range] || {}).length,
        '| Zeitraum-Wert:', JSON.stringify(perfByRange[range]?.[activeHoldings[0]?.isin]),
        '| Gesamtgewinn:', (activeHoldings[0]?.value ?? 0) - (activeHoldings[0]?.costValue ?? 0))

    const logoOf = (item) =>
        item.logo || (/^[A-Z]{2}[A-Z0-9]{10}$/.test(item.isin || '') ? `https://image.parqet.com/security/${item.isin}` : null)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* KPI KARTEN */}
            <div className="kpi-grid">
                <KpiCard
                    label="Aktive Positionen"
                    value={activeHoldings.length.toString()}
                    color="#a78bfa"
                    sub="Alle Assets im Depot"
                />
            </div>
            {/* PERFORMANCE-CHART */}
            <PortfolioPerformanceChart
                series={performanceSeries}
                range={range}
                onRangeChange={setRange}
                portfolioPerformance={portfolioPerfByRange[range]}
            />

            {/* 1. SEKTION: AKTIVE BESTÄNDE (Parqet App Style) */}
            <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
                        💼 Aktive Bestände
                    </h3>
                </div>

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
                            const pending = range !== 'MAX' && !perfByRange[range]
                            const rp = range === 'MAX' ? null : (perfByRange[range]?.[item.id] ?? perfByRange[range]?.[item.isin])
                            const unrealized = rp ? rp.unrealized : val - cost
                            const realized = rp ? rp.realized : (item.realizedGain || 0)
                            const dividends = rp ? rp.dividends : (item.dividends || 0)
                            const profit = unrealized
                            const base = rp ? (rp.startValue > 0 ? rp.startValue : cost) : cost
                            const profitPercent = base > 0 ? (profit / base) * 100 : 0
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
                                    {/* Obere Zeile: Logo, Name & Aktueller Wert */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {logoOf(item) && (
                                                <img
                                                    src={logoOf(item)}
                                                    alt=""
                                                    width={44}
                                                    height={44}
                                                    style={{ borderRadius: 10, background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                                />
                                            )}
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                                                    {getDisplayName(item)}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                                <span style={{ background: '#1e293b', color: '#38bdf8', fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 500 }}>
                                                    {item.type || 'Asset'}
                                                </span>
                                                    {sharesNum > 0 && (
                                                        <span style={{ fontSize: 12, color: '#64748b' }}>
                                                            {sharesNum.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Anteile
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
                                                {val > 0 ? fmt(val) : '—'}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                                                {pending ? '…' : base > 0 ? `${isPositive ? '+' : ''}${fmt(profit)} (${isPositive ? '+' : ''}${profitPercent.toFixed(2).replace('.', ',')}%)` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/*Untere Zeile: Einstandswert*/}
                                    {(cost > 0 || realized !== 0 || dividends > 0) && (
                                        <div style={{
                                            borderTop: '1px solid #1a2233',
                                            paddingTop: 10,
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                                            gap: 8,
                                        }}>
                                            {cost > 0 && <Stat label="Einstandswert" value={fmt(cost)} />}
                                            {realized !== 0 && (
                                                <Stat
                                                    label="Realisiert"
                                                    value={`${realized >= 0 ? '+' : ''}${fmt(realized)}`}
                                                    color={realized >= 0 ? '#22c55e' : '#ef4444'}
                                                />
                                            )}
                                            {dividends > 0 && (
                                                <Stat
                                                    label="Dividenden"
                                                    value={`+${fmt(dividends)}`}
                                                    color="#22c55e"
                                                />
                                            )}
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