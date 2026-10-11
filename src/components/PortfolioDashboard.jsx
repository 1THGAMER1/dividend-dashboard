import React, { useEffect, useMemo, useState } from 'react'
import KpiCard from './KpiCard.jsx'
import PortfolioPerformanceChart from './PortfolioPerformanceChart.jsx'
import { fetchPositionPerformance } from '../api.js'
import AssetHoldingDonut from "./AssetHoldingDonut.jsx"
import HoldingDetailModal from './HoldingDetailModal.jsx'


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
                                               holdings = [],
                                               performanceSeries,
                                               forecast12m,
                                               buyActs = [],
                                               sellActs = [],
                                               byHolding = {},
                                               forecastByHolding = {},
                                           }) {
    const displayValue = currentValue ?? currentVal ?? 0
    const [range, setRange] = useState('1Y')
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [sortBy, setSortBy] = useState('value') // 'value' | 'profit' | 'profitPercent' | 'dividends' | 'realized'
    const [sortDir, setSortDir] = useState('desc') // 'desc' | 'asc'

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortBy(field)
            setSortDir('desc')
        }
    }

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

    const rawActiveHoldings = (holdings || []).filter(h => (h.shares || 0) > 0.0001 && (h.value || 0) > 0)

    // activeHoldings MUSS VOR periodRealized / periodDividends stehen:
    const activeHoldings = useMemo(() => {
        return [...rawActiveHoldings].sort((a, b) => {
            const getVal = (item, field) => {
                const rp = range === 'MAX' ? null : (perfByRange[range]?.[item.id] ?? perfByRange[range]?.[item.isin])
                const val = item.value || 0
                const cost = item.costValue || 0
                const realized = rp ? rp.realized : (item.realizedGain || 0)
                const dividends = rp ? rp.dividends : (item.dividends || 0)
                const profit = rp ? rp.unrealized : val - cost
                const base = rp ? (rp.startValue > 0 ? rp.startValue : cost) : cost
                const profitPercent = base > 0 ? (profit / base) * 100 : 0

                switch (field) {
                    case 'value': return val
                    case 'profit': return profit
                    case 'profitPercent': return profitPercent
                    case 'dividends': return dividends
                    case 'realized': return realized
                    default: return val
                }
            }

            const valA = getVal(a, sortBy)
            const valB = getVal(b, sortBy)
            return sortDir === 'desc' ? valB - valA : valA - valB
        })
    }, [rawActiveHoldings, sortBy, sortDir, range, perfByRange])

    const currentPerf = portfolioPerfByRange[range]
    const periodRealized = range === 'MAX'
        ? activeHoldings.reduce((sum, h) => sum + (h.realizedGain || 0), 0)
        : (currentPerf?.realizedGain ?? 0)
    const periodDividends = range === 'MAX'
        ? activeHoldings.reduce((sum, h) => sum + (h.dividends || 0), 0)
        : (currentPerf?.dividends ?? Object.values(perfByRange[range] || {}).reduce((sum, p) => sum + (p.dividends || 0), 0))
    const periodUnrealized = range === 'MAX'
        ? activeHoldings.reduce((sum, h) => sum + ((h.value || 0) - (h.costValue || 0)), 0)
        : (currentPerf?.unrealizedGain ?? 0)

    const soldHoldings = holdings
        .filter(item => getShares(item) <= 0.000001)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    const getDisplayName = (item) => item.name || item.isin || 'Unbekanntes Asset'

    const logoOf = (item) =>
        item.logo || (/^[A-Z]{2}[A-Z0-9]{10}$/.test(item.isin || '') ? `https://image.parqet.com/security/${item.isin}` : null)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* GROSSE HERO KPI-CARD (RESPONSIV: PC NEBENEINANDER, HANDY UNTEREINANDER) */}
            <div style={{
                background: '#161b27',
                border: '1px solid #1e2a3a',
                borderRadius: 16,
                padding: 'clamp(14px, 2.5vw, 24px)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 20,
                alignItems: 'center',
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 20,
                overflow: 'hidden'
            }}>
                {/* Donut mit Gesamtwert */}
                <div style={{
                    flex: '1 1 260px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minWidth: 0,
                    width: '100%'
                }}>
                    <AssetHoldingDonut holdings={activeHoldings} compact={true} />
                </div>
                {/* Die 4 KPI-Karten: Synchron mit dem gewählten Zeitraum */}
                <div style={{
                    flex: '2 1 0',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    minWidth: 'min(100%, max-content)',
                }}>
                    <KpiCard
                        label="Aktive Positionen"
                        value={activeHoldings.length.toString()}
                        color="#a78bfa"
                        sub="Assets im Depot"
                    />
                    <KpiCard
                        label={range === 'MAX' ? "Kursgewinn" : "Kursgewinn Zeitraum"}
                        value={`${periodUnrealized >= 0 ? '+' : ''}${fmt(periodUnrealized)}`}
                        color={periodUnrealized >= 0 ? "#22c55e" : "#ef4444"}
                        sub={range === 'MAX' ? "Unrealisiert" : `Zeitraum: ${range}`}
                    />
                    <KpiCard
                        label={range === 'MAX' ? "Realisierter Gewinn" : "Realisiert Zeitraum"}
                        value={`${periodRealized >= 0 ? '+' : ''}${fmt(periodRealized)}`}
                        color={periodRealized >= 0 ? "#22c55e" : "#ef4444"}
                        sub={range === 'MAX' ? "Teilverkäufe" : `Zeitraum: ${range}`}
                    />
                    <KpiCard
                        label={range === 'MAX' ? "Dividenden" : "Dividenden Zeitraum"}
                        value={periodDividends > 0 ? `+${fmt(periodDividends)}` : '0,00 €'}
                        color="#22c55e"
                        sub={range === 'MAX' ? "Erhalten" : `Zeitraum: ${range}`}
                    />
                </div>
            </div>

            {/* 2 CHARTS: PC NEBENEINANDER, HANDY UNTEREINANDER */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                gap: 16,
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 24,
                alignItems: 'stretch'
            }}>
                {/* Linker Chart: Portfolio-Wert in Euro / Drawdown */}
                <PortfolioPerformanceChart
                    series={performanceSeries}
                    range={range}
                    onRangeChange={setRange}
                    portfolioPerformance={portfolioPerfByRange[range]}
                    forcedMode="value"
                />

                {/* Rechter Chart: Rendite in % */}
                <PortfolioPerformanceChart
                    series={performanceSeries}
                    range={range}
                    onRangeChange={setRange}
                    portfolioPerformance={portfolioPerfByRange[range]}
                    forcedMode="return"
                />
            </div>

            {/* AKTIVE BESTÄNDE MIT SORTIERLEISTE (Clean ohne doppelte Umrahmung) */}
            <div style={{ marginBottom: 32 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginBottom: 16
                }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                        💼 Aktive Bestände ({activeHoldings.length})
                    </h3>

                    {/* Sortier-Buttons */}
                    <div style={{
                        display: 'flex',
                        gap: 4,
                        background: '#0f1420',
                        padding: 3,
                        borderRadius: 8,
                        border: '1px solid #1e2a3a',
                        overflowX: 'auto',
                        maxWidth: '100%'
                    }}>
                        {[
                            ['value', 'Allokation'],
                            ['profit', 'Gewinn (€)'],
                            ['profitPercent', 'Rendite (%)'],
                            ['dividends', 'Dividenden'],
                            ['realized', 'Realisiert'],
                        ].map(([field, label]) => {
                            const active = sortBy === field
                            const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''
                            return (
                                <button
                                    key={field}
                                    onClick={() => handleSort(field)}
                                    style={{
                                        background: active ? '#009991' : 'transparent',
                                        color: active ? '#fff' : '#64748b',
                                        border: 'none',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {label}{arrow}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {activeHoldings.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                        Keine aktiven Bestände gefunden.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeHoldings.map((item) => {
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
                                <div
                                    key={item.id || item.isin}
                                    onClick={() => setSelectedHolding(item)}
                                    style={{
                                        background: '#161b27',
                                        border: '1px solid #1e2a3a',
                                        borderRadius: 12,
                                        padding: '12px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#38bdf8'
                                        e.currentTarget.style.background = '#1a2233'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = '#1e2a3a'
                                        e.currentTarget.style.background = '#161b27'
                                    }}
                                >

                                    {/* HAUPTZEILE: LINKS NAME, RECHTS MARKTWERT */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        width: '100%',
                                    }}>
                                        {/* Links: Logo, Name & Badge */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                            {logoOf(item) && (
                                                <img
                                                    src={logoOf(item)}
                                                    alt=""
                                                    width={32}
                                                    height={32}
                                                    style={{ borderRadius: 8, background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                                                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                                                />
                                            )}
                                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                                <div style={{
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: '#f1f5f9',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    {getDisplayName(item)}
                                                </div>
                                                {(() => {
                                                    const weightPct = displayValue > 0 && val > 0 ? ((val / displayValue) * 100).toFixed(1).replace('.', ',') : null

                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                                                            <span style={{ background: '#1e293b', color: '#38bdf8', fontSize: 9, padding: '1px 5px', borderRadius: 4, fontWeight: 500 }}>
                                                                {item.type || 'Asset'}
                                                            </span>
                                                            {sharesNum > 0 && (
                                                                <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                                                                    {sharesNum.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Anteile
                                                                </span>
                                                            )}
                                                            {weightPct && (
                                                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                                    · {weightPct} %
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>

                                        {/* Rechts: Marktwert & Gewinn/Rendite */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                                                {val > 0 ? fmt(val) : '—'}
                                            </div>
                                            <div style={{ fontSize: 11, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', marginTop: 1 }}>
                                                {pending ? '…' : base > 0 ? `${isPositive ? '+' : ''}${fmt(profit)} (${isPositive ? '+' : ''}${profitPercent.toFixed(2).replace('.', ',')}%)` : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* UNTERZEILE: Einstand, Realisiert, Dividenden */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        gap: 6,
                                        paddingTop: 8,
                                        borderTop: '1px solid #1a2233',
                                        width: '100%',
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>Einstand</div>
                                            <div style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {cost > 0 ? fmt(cost) : '—'}
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>Realisiert</div>
                                            <div style={{
                                                fontSize: 11,
                                                fontWeight: 500,
                                                color: realized !== 0 ? (realized >= 0 ? '#22c55e' : '#ef4444') : '#64748b',
                                                marginTop: 1,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {realized !== 0 ? `${realized >= 0 ? '+' : ''}${fmt(realized)}` : '—'}
                                            </div>
                                        </div>

                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 }}>Dividenden</div>
                                            <div style={{
                                                fontSize: 11,
                                                fontWeight: 500,
                                                color: dividends > 0 ? '#22c55e' : '#64748b',
                                                marginTop: 1,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {dividends > 0 ? `+${fmt(dividends)}` : '—'}
                                            </div>
                                        </div>
                                    </div>
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
                                }}
                                     onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = '#2a3a50'
                                    e.currentTarget.style.background = '#1a2233'
                                }}
                                     onMouseLeave={(e) => {
                                         e.currentTarget.style.borderColor = '#1e2a3a'
                                         e.currentTarget.style.background = '#161b27'
                                     }}
                                >
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
            {selectedHolding && (
                <HoldingDetailModal
                    holding={selectedHolding}
                    onClose={() => setSelectedHolding(null)}
                    buyActs={buyActs}
                    sellActs={sellActs}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                    range={range}
                    perfByRange={perfByRange}
                    totalPortfolioValue={displayValue}
                />
            )}
        </div>
    )
}