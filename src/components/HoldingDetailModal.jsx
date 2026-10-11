import React, { useState } from 'react'

const fmt = (n) => {
    const val = Number(n || 0)
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(val)
}

const fmtDate = (d) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function HoldingDetailModal({
                                               holding,
                                               onClose,
                                               buyActs = [],
                                               sellActs = [],
                                               byHolding = {},
                                               forecastByHolding = {},
                                               range = 'MAX',
                                               perfByRange = {},
                                               totalPortfolioValue = 0,
                                           }) {
    const [tab, setTab] = useState('overview') // 'overview' | 'activities' | 'dividends'

    if (!holding) return null

    const isin = holding.isin || holding.id
    const val = holding.value || 0
    const cost = holding.costValue || 0
    const sharesNum = parseFloat(holding.shares) || 0

    // Zeitraum-Werte
    const rp = range === 'MAX' ? null : (perfByRange[range]?.[holding.id] ?? perfByRange[range]?.[holding.isin])
    const unrealized = rp ? rp.unrealized : val - cost
    const realized = rp ? rp.realized : (holding.realizedGain || 0)
    const dividends = rp ? rp.dividends : (holding.dividends || 0)
    const profit = unrealized
    const base = rp ? (rp.startValue > 0 ? rp.startValue : cost) : cost
    const profitPercent = base > 0 ? (profit / base) * 100 : 0
    const isPositive = profit >= 0

    // Allokation am Gesamtdepot
    const weightPct = totalPortfolioValue > 0 && val > 0
        ? ((val / totalPortfolioValue) * 100).toFixed(1).replace('.', ',')
        : null

    // Durchschnittlicher Kaufkurs
    const avgBuyPrice = sharesNum > 0 && cost > 0 ? cost / sharesNum : null
    // Aktueller Kurs
    const currentPrice = sharesNum > 0 && val > 0 ? val / sharesNum : null

    // Aktivitäten filtern (Käufe & Verkäufe für diese ISIN)
    const isMyAct = (a) => {
        const aIsin = a.asset?.isin || a.asset?.symbol || a.holdingId || a.isin
        return aIsin === isin || aIsin === holding.id || a.holdingId === holding.holdingId
    }

    const myBuys = (buyActs || []).filter(isMyAct).map(a => ({ ...a, _type: 'BUY' }))
    const mySells = (sellActs || []).filter(isMyAct).map(a => ({ ...a, _type: 'SELL' }))

    // Dividenden aus byHolding oder übergebenen Aktivitäten filtern
    const divEntry = byHolding[isin] || byHolding[holding.id] || {}
    const myDivs = []
    if (divEntry.monthly) {
        Object.entries(divEntry.monthly).forEach(([year, months]) => {
            months.forEach((amt, mIdx) => {
                if (amt > 0) {
                    // Erzeuge einen Eintrag pro Auszahlungsmonat
                    myDivs.push({
                        _type: 'DIVIDEND',
                        datetime: `${year}-${String(mIdx + 1).padStart(2, '0')}-15`, // Monatsmitte als Referenz
                        amount: amt,
                        shares: sharesNum
                    })
                }
            })
        })
    }

    // Alle drei Transaktionsarten chronologisch nach Datum sortieren (neueste zuerst)
    const allActivities = [...myBuys, ...mySells, ...myDivs].sort(
        (a, b) => new Date(b.datetime || 0) - new Date(a.datetime || 0)
    )
    // Erhaltene Dividenden nach Jahren
    const divYears = Object.keys(divEntry.monthly || {}).sort((a, b) => b - a)

    // Gesamte historische Dividenden
    const totalDivsHistorical = Object.values(divEntry.monthly || {})
        .flatMap(months => months)
        .reduce((sum, v) => sum + (v || 0), 0)

    // Prognostizierte Dividenden nächste 12 Monate
    const fcMonths = forecastByHolding[isin] || forecastByHolding[holding.id] || {}
    const forecast12mHolding = Object.values(fcMonths).reduce((s, v) => s + (v || 0), 0)

    const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '16px',
                boxSizing: 'border-box',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#161b27',
                    border: '1px solid #1e2a3a',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 620,
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
                }}
            >
                {/* 1. HEADER */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #1e2a3a',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#10141f'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        {holding.logo && (
                            <img
                                src={holding.logo}
                                alt=""
                                width={40}
                                height={40}
                                style={{ borderRadius: 10, background: '#fff', objectFit: 'contain', flexShrink: 0 }}
                                onError={(e) => { e.currentTarget.style.display = 'none' }}
                            />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {holding.name || isin}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span>{isin}</span>
                                {holding.type && (
                                    <span style={{ background: '#1e293b', color: '#38bdf8', padding: '1px 6px', borderRadius: 4, fontWeight: 500, fontSize: 10 }}>
                                        {holding.type}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: '#1e293b',
                            border: 'none',
                            color: '#94a3b8',
                            fontSize: 16,
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* 2. REITER-NAVIGATION */}
                <div style={{
                    display: 'flex',
                    background: '#0c1019',
                    borderBottom: '1px solid #1e2a3a',
                    padding: '4px 12px',
                    gap: 6
                }}>
                    {[
                        ['overview', 'Übersicht'],
                        ['activities', `Aktivitäten (${allActivities.length})`],
                        ['dividends', `Dividenden`],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            style={{
                                background: tab === key ? '#1e293b' : 'transparent',
                                color: tab === key ? '#f1f5f9' : '#64748b',
                                border: 'none',
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* 3. INHALTSBEREICH (Scrollbar) */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* TAB 1: ÜBERSICHT */}
                    {tab === 'overview' && (
                        <>
                            {/* Großer Marktwert-Kasten */}
                            <div style={{
                                background: '#0f1420',
                                border: '1px solid #1e2a3a',
                                borderRadius: 12,
                                padding: 16,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 12
                            }}>
                                <div>
                                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Aktueller Wert</div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>{fmt(val)}</div>
                                    <div style={{ fontSize: 12, color: isPositive ? '#22c55e' : '#ef4444', fontWeight: 600, marginTop: 2 }}>
                                        {isPositive ? '+' : ''}{fmt(profit)} ({isPositive ? '+' : ''}{profitPercent.toFixed(2).replace('.', ',')}%)
                                        <span style={{ color: '#64748b', fontWeight: 400 }}> · {range === 'MAX' ? 'Seit Kauf' : range}</span>
                                    </div>
                                </div>

                                {weightPct && (
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Allokation</div>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>{weightPct} %</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>vom Gesamtdepot</div>
                                    </div>
                                )}
                            </div>

                            {/* 4er Kennzahlen-Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Anteile</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 3 }}>
                                        {sharesNum.toLocaleString('de-DE', { maximumFractionDigits: 4 })}
                                    </div>
                                </div>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Einstandswert</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 3 }}>{fmt(cost)}</div>
                                </div>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Ø Kaufkurs</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 3 }}>
                                        {avgBuyPrice ? fmt(avgBuyPrice) : '—'}
                                    </div>
                                </div>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Aktueller Kurs</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginTop: 3 }}>
                                        {currentPrice ? fmt(currentPrice) : '—'}
                                    </div>
                                </div>
                            </div>

                            {/* Realisiert & Dividenden Box */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Realisiert ({range})</div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: realized >= 0 ? '#22c55e' : '#ef4444', marginTop: 3 }}>
                                        {realized !== 0 ? `${realized >= 0 ? '+' : ''}${fmt(realized)}` : '0,00 €'}
                                    </div>
                                </div>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Dividenden ({range})</div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginTop: 3 }}>
                                        {dividends > 0 ? `+${fmt(dividends)}` : '0,00 €'}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* TAB 2: AKTIVITÄTEN (Käufe & Verkäufe) */}
                    {tab === 'activities' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {allActivities.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', fontSize: 13 }}>
                                    Keine Transaktionen für diesen Wert gefunden.
                                </div>
                            ) : (
                                allActivities.map((act, i) => {
                                    const isBuy = act._type === 'BUY'
                                    const isSell = act._type === 'SELL'
                                    const isDiv = act._type === 'DIVIDEND'

                                    const shares = parseFloat(act.shares || act.quantity || 0)
                                    const amount = parseFloat(act.amount || act.total || act.amountNet || 0)
                                    const price = parseFloat(act.price || (shares > 0 ? amount / shares : 0))

                                    const badgeColor = isBuy ? '#22c55e' : isSell ? '#ef4444' : '#fbbf24'
                                    const badgeBg = isBuy ? 'rgba(34, 197, 94, 0.15)' : isSell ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)'
                                    const badgeLabel = isBuy ? 'KAUF' : isSell ? 'VERKAUF' : 'DIVIDENDE'

                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                background: '#0f1420',
                                                border: '1px solid #1e2a3a',
                                                borderRadius: 10,
                                                padding: '10px 14px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span style={{
                                                    background: badgeBg,
                                                    color: badgeColor,
                                                    border: `1px solid ${badgeColor}40`,
                                                    borderRadius: 6,
                                                    padding: '2px 8px',
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    minWidth: 65,
                                                    textAlign: 'center'
                                                }}>
                                                    {badgeLabel}
                                                </span>
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>
                                                        {isDiv
                                                            ? 'Ausschüttung erhalten'
                                                            : `${shares.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Anteile zu ${fmt(price)}`
                                                        }
                                                    </div>
                                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                                                        {fmtDate(act.datetime)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: isDiv ? '#22c55e' : '#f1f5f9'
                                                }}>
                                                    {isDiv ? `+${fmt(amount)}` : fmt(amount)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {/* TAB 3: DIVIDENDEN */}
                    {tab === 'dividends' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Zusammenfassung oben */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Bisher erhalten gesamt</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#22c55e', marginTop: 2 }}>{fmt(totalDivsHistorical)}</div>
                                </div>
                                <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Prognose nächste 12M</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8', marginTop: 2 }}>{fmt(forecast12mHolding)}</div>
                                </div>
                            </div>

                            {/* Historie nach Jahren */}
                            {divYears.length === 0 && Object.keys(fcMonths).length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#64748b', padding: '30px 0', fontSize: 13 }}>
                                    Keine Dividenden für dieses Asset erfasst.
                                </div>
                            ) : (
                                divYears.map(year => {
                                    const months = divEntry.monthly[year] || []
                                    const yearSum = months.reduce((s, v) => s + (v || 0), 0)
                                    if (yearSum <= 0) return null

                                    return (
                                        <div key={year} style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 10, padding: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{year}</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>+{fmt(yearSum)}</span>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                                                {months.map((mVal, mIdx) => (
                                                    <div key={mIdx} style={{
                                                        background: mVal > 0 ? 'rgba(34, 197, 94, 0.08)' : '#090d15',
                                                        border: `1px solid ${mVal > 0 ? 'rgba(34, 197, 94, 0.25)' : '#161b27'}`,
                                                        borderRadius: 6,
                                                        padding: '4px 6px',
                                                        textAlign: 'center'
                                                    }}>
                                                        <div style={{ fontSize: 9, color: '#64748b' }}>{MONTH_NAMES[mIdx]}</div>
                                                        <div style={{ fontSize: 10, fontWeight: 600, color: mVal > 0 ? '#22c55e' : '#475569', marginTop: 1 }}>
                                                            {mVal > 0 ? fmt(mVal) : '—'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}