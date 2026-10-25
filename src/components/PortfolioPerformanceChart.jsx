import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const RANGES = [
    ['1D', '1T'], ['7D', '7T'], ['30D', '30T'], ['3M', '3M'], ['6M', '6M'],
    ['YTD', 'YTD'], ['1Y', '1J'], ['3Y', '3J'], ['MAX', 'Seit Kauf'],
]

const eur = (n) =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: 'EUR',
        maximumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
        minimumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
    }).format(Number(n) || 0)

const eurShort = (n) =>
    Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace('.', ',')}k` : `${Math.round(n)}`

const pct = (n) => (n == null || isNaN(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`)
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—')

function cutoffFor(range, lastDate) {
    if (!lastDate) return null
    const d = new Date(lastDate)
    switch (range) {
        case '1D':
            d.setDate(d.getDate() - 1); break
        case '7D':
            d.setDate(d.getDate() - 7); break
        case '30D':
            d.setDate(d.getDate() - 30); break
        case '3M':
            d.setMonth(d.getMonth() - 3); break
        case '6M':
            d.setMonth(d.getMonth() - 6); break
        case 'YTD':
            return `${d.getFullYear() - 1}-12-31`
        case '1Y':
            d.setFullYear(d.getFullYear() - 1); break
        case '3Y':
            d.setFullYear(d.getFullYear() - 3); break
        default:
            return null
    }
    return d.toISOString().slice(0, 10)
}

const btn = (active) => ({
    background: active ? '#009991' : 'transparent',
    color: active ? '#fff' : '#64748b',
    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.15s ease',
})

const toggleWrap = { display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }

const cardStyle = {
    background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16,
    padding: 'clamp(12px, 3vw, 20px)',
}

export default function PortfolioPerformanceChart({
                                                      series = [],
                                                      range: rangeProp,
                                                      onRangeChange,
                                                      forcedMode,
                                                      hideRanges = false,
                                                  }) {
    const [ownRange, setOwnRange] = useState('MAX')
    const range = rangeProp ?? ownRange
    const setRange = onRangeChange ?? setOwnRange
    const [internalMode, setInternalMode] = useState('value')
    const mode = forcedMode ?? internalMode
    const setMode = setInternalMode
    const [returnType, setReturnType] = useState('simple') // 'simple' | 'twr'
    const [valueSubMode, setValueSubMode] = useState('value') // 'value' | 'drawdown'

    // 1. TTRWOR & Peak-Berechnung über die gesamte Kurve unabhängig von Parqet
    const normalizedSeries = useMemo(() => {
        if (!Array.isArray(series) || series.length === 0) return []

        let runningTwrIndex = 1
        let runningPeak = 0

        return series.map((p, i) => {
            const v = Number(p.v) || 0
            const c = p.c != null ? Number(p.c) : null

            // Drawdown-Peak
            if (v > runningPeak) runningPeak = v
            const dd = runningPeak > 0 ? ((v - runningPeak) / runningPeak) * 100 : 0

            // TTRWOR: Falls vorhanden nutzen, andernfalls mathematisch berechnen
            let twr = p.t
            if (twr == null) {
                if (i > 0) {
                    const prev = series[i - 1]
                    const prevV = Number(prev.v) || 0
                    const flow = (c ?? 0) - (Number(prev.c) ?? 0)
                    const base = prevV > 0 ? prevV + (flow > 0 ? flow : 0) : flow

                    if (base > 0) {
                        const r = (v - prevV - flow) / base
                        if (Number.isFinite(r) && r > -1) {
                            runningTwrIndex *= (1 + r)
                        }
                    }
                }
                twr = (runningTwrIndex - 1) * 100
            }

            return {
                d: p.d,
                v,
                c,
                twr,
                dd: Math.min(0, dd),
            }
        })
    }, [series])

    // 2. Intervall-Zuschnitt und Intervall-Renditen berechnen
    const data = useMemo(() => {
        if (normalizedSeries.length < 2) return []

        const lastDate = normalizedSeries[normalizedSeries.length - 1].d
        const cut = cutoffFor(range, lastDate)

        let sub = normalizedSeries
        if (cut) {
            let start = -1
            for (let i = normalizedSeries.length - 1; i >= 0; i--) {
                if (normalizedSeries[i].d <= cut) { start = i; break }
            }
            sub = normalizedSeries.slice(Math.max(start, 0))
        }
        if (sub.length < 2) sub = normalizedSeries.slice(-2)

        const first = sub[0]
        const firstGain = first.v - (first.c ?? 0)

        // Drawdown-Peak für den spezifischen Sub-Zeitraum zurücksetzen
        let periodPeak = 0

        return sub.map(p => {
            if (p.v > periodPeak) periodPeak = p.v
            const periodDd = periodPeak > 0 ? ((p.v - periodPeak) / periodPeak) * 100 : 0

            // TTWROR relativ zum Start des Zeitraums
            const r = ((1 + p.twr / 100) / (1 + first.twr / 100) - 1) * 100

            // Einfache Rendite im Zeitraum
            let s = 0
            if (range === 'MAX') {
                s = p.c > 0 ? ((p.v - p.c) / p.c) * 100 : 0
            } else {
                const netFlow = (p.c ?? 0) - (first.c ?? 0)
                const base = first.v + (netFlow > 0 ? netFlow : 0)
                const currentGain = p.v - (p.c ?? 0)
                s = base > 0 ? ((currentGain - firstGain) / base) * 100 : 0
            }

            return {
                ...p,
                r,
                s,
                dd: Math.min(0, periodDd),
            }
        })
    }, [normalizedSeries, range])

    // Nulllinien-Berechnung für Farbverlauf (Grün oben / Rot unten)
    const off = useMemo(() => {
        if (!data.length) return 0
        const key = returnType === 'twr' ? 'r' : 's'
        const values = data.map(d => (mode === 'return' ? d[key] : d.v)).filter(v => v != null)
        if (!values.length) return 0
        const max = Math.max(...values)
        const min = Math.min(...values)
        const zero = mode === 'return' ? 0 : (data[0]?.v ?? 0)

        if (max <= zero) return 0
        if (min >= zero) return 1
        return (max - zero) / (max - min)
    }, [data, mode, returnType])

    if (!series || series.length === 0) return null

    if (data.length < 2) {
        return (
            <div style={{ ...cardStyle, color: '#64748b', fontSize: 12 }}>
                📈 Noch nicht genügend Daten für den Verlauf vorhanden.
            </div>
        )
    }

    const first = data[0]
    const last = data[data.length - 1]
    const hasCapital = data.some(p => p.c != null && p.c > 0)

    // Kennzahlen für den Header
    const diffCapital = (last.c ?? 0) - (first.c ?? 0)
    const gainRange = range === 'MAX'
        ? last.v - (last.c ?? 0)
        : (last.v - first.v) - diffCapital

    const simpleReturn = last.s ?? 0
    const exactTwr = last.r ?? 0

    const retKey = returnType === 'twr' ? 'r' : 's'
    const retValue = returnType === 'twr' ? exactTwr : simpleReturn
    const positive = (mode === 'value' ? gainRange : retValue) >= 0
    const color = mode === 'return' ? (positive ? '#22c55e' : '#ef4444') : '#009991'

    return (
        <div style={cardStyle}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 12
            }}>
                <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                        {mode === 'value'
                            ? (valueSubMode === 'drawdown' ? '📉 Drawdown' : '💶 Wertentwicklung')
                            : '📈 Rendite'}
                    </h3>

                    {mode === 'value' ? (
                        valueSubMode === 'drawdown' ? (
                            <>
                                <div style={{ fontSize: 22, fontWeight: 700, color: (last.dd ?? 0) >= 0 ? '#22c55e' : '#ef4444', marginTop: 6 }}>
                                    {pct(last.dd ?? 0)}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 2, color: '#64748b' }}>
                                    Max. Drawdown im Zeitraum:{' '}
                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                        {pct(Math.min(...data.map(d => d.dd ?? 0)))}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginTop: 6 }}>
                                    {eur(last.v)}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 2, color: gainRange >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {range === 'MAX' ? 'Gewinn seit Kauf' : 'Gewinn im Zeitraum'}{' '}
                                    {`${gainRange >= 0 ? '+' : ''}${eur(gainRange)}`}{' '}
                                    ({pct(simpleReturn)})
                                    {last.c != null && <span style={{ color: '#64748b' }}> · investiert {eur(last.c)}</span>}
                                </div>
                            </>
                        )
                    ) : (
                        <>
                            <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6 }}>{pct(retValue)}</div>
                            <div style={{ fontSize: 12, marginTop: 2, color: '#64748b' }}>
                                Einfach <span style={{ color: simpleReturn >= 0 ? '#22c55e' : '#ef4444' }}>
                                    {pct(simpleReturn)}
                                </span>
                                {' · '}
                                TTWROR <span style={{ color: exactTwr >= 0 ? '#22c55e' : '#ef4444' }}>{pct(exactTwr)}</span>
                            </div>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    {!forcedMode && (
                        <div style={toggleWrap}>
                            <button onClick={() => setMode('value')} style={btn(mode === 'value')}>Wert</button>
                            <button onClick={() => setMode('return')} style={btn(mode === 'return')}>Rendite</button>
                        </div>
                    )}
                    {mode === 'value' && (
                        <div style={toggleWrap}>
                            <button onClick={() => setValueSubMode('value')} style={btn(valueSubMode === 'value')}>Wert</button>
                            <button onClick={() => setValueSubMode('drawdown')} style={btn(valueSubMode === 'drawdown')}>Drawdown</button>
                        </div>
                    )}
                    {mode === 'return' && (
                        <div style={toggleWrap}>
                            <button onClick={() => setReturnType('simple')} style={btn(returnType === 'simple')}>Einfach</button>
                            <button onClick={() => setReturnType('twr')} style={btn(returnType === 'twr')}>TTWROR</button>
                        </div>
                    )}
                </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <ComposedChart key={`${mode}-${returnType}`} data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`lineColor-${mode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#22c55e" />
                            <stop offset={off} stopColor="#ef4444" />
                        </linearGradient>

                        <linearGradient id={`perfFill-${mode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                            <stop offset={off} stopColor="#22c55e" stopOpacity={0.02} />
                            <stop offset={off} stopColor="#ef4444" stopOpacity={0.02} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
                        </linearGradient>

                        <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>

                    <CartesianGrid stroke="#1e2a3a" vertical={false} />
                    <XAxis
                        dataKey="d"
                        tickFormatter={['1D', '7D', '30D'].includes(range) ? fmtDay : fmtDate}
                        minTickGap={40}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        width={44}
                        domain={['auto', 'auto']}
                        tickFormatter={mode === 'value' ? (valueSubMode === 'drawdown' ? (v) => `${v.toFixed(0)}%` : eurShort) : (v) => `${v.toFixed(0)}%`}
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#161b27',
                            borderColor: '#2a3a50',
                            borderRadius: 8,
                            fontSize: 12,
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        labelFormatter={fmtDate}
                        formatter={(val, _name, item) => {
                            if (item.dataKey === 'dd') return [pct(val), 'Drawdown']
                            if (item.dataKey === 'r') return [pct(val), 'TTWROR']
                            if (item.dataKey === 's') return [pct(val), 'Rendite (einfach)']
                            if (item.dataKey === 'v') {
                                const pt = item.payload
                                if (pt && pt.c != null) {
                                    const diff = pt.v - pt.c
                                    const diffPct = pt.c > 0 ? (diff / pt.c) * 100 : 0
                                    const sign = diff >= 0 ? '+' : ''
                                    return [
                                        `${eur(val)} (${sign}${eur(diff)} / ${sign}${diffPct.toFixed(2).replace('.', ',')} %)`,
                                        'Depotwert'
                                    ]
                                }
                                return [eur(val), 'Depotwert']
                            }
                            return [eur(val), 'Investiert']
                        }}
                    />

                    {mode === 'value' && valueSubMode === 'value' && (
                        <Area type="monotone" dataKey="v" stroke={`url(#lineColor-${mode})`} strokeWidth={2}
                              fill={`url(#perfFill-${mode})`} dot={false} isAnimationActive={false} />
                    )}
                    {mode === 'value' && valueSubMode === 'value' && hasCapital && (
                        <Line type="monotone" dataKey="c" stroke="#94a3b8" strokeWidth={1.5}
                              strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    )}
                    {mode === 'value' && valueSubMode === 'drawdown' && (
                        <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={2}
                              fill="url(#drawdownFill)" dot={false} isAnimationActive={false} />
                    )}
                    {mode === 'return' && (
                        <Area type="monotone" dataKey={retKey} stroke={`url(#lineColor-${mode})`} strokeWidth={2}
                              fill={`url(#perfFill-${mode})`} dot={false} isAnimationActive={false} connectNulls />
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            {!hideRanges && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, justifyContent: 'center' }}>
                    {RANGES.map(([id, label]) => (
                        <button key={id} onClick={() => setRange(id)} style={btn(range === id)}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}