import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const RANGES = [['1M', '1M'], ['3M', '3M'], ['YTD', 'YTD'], ['1J', '1J'], ['MAX', 'Max']]

const eur = (n) =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: 'EUR',
        maximumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
        minimumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
    }).format(n)

const eurShort = (n) =>
    Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace('.', ',')}k` : `${Math.round(n)}`

const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })

function cutoffFor(range, lastDate) {
    const d = new Date(lastDate)
    if (range === '1M') d.setMonth(d.getMonth() - 1)
    else if (range === '3M') d.setMonth(d.getMonth() - 3)
    else if (range === '1J') d.setFullYear(d.getFullYear() - 1)
    else if (range === 'YTD') return `${d.getFullYear()}-01-01`
    else return null
    return d.toISOString().slice(0, 10)
}

const btn = (active) => ({
    background: active ? '#009991' : 'transparent',
    color: active ? '#fff' : '#64748b',
    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
})

const cardStyle = {
    background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16,
    padding: 'clamp(12px, 3vw, 20px)',
}

export default function PortfolioPerformanceChart({ series }) {
    const [range, setRange] = useState('1J')
    const [mode, setMode] = useState('value') // 'value' | 'return'

    const data = useMemo(() => {
        if (!Array.isArray(series) || series.length < 2) return []
        const cut = cutoffFor(range, series[series.length - 1].d)
        const sub = cut ? series.filter(p => p.d >= cut) : series
        if (!sub.length) return []

        const first = sub[0]
        return sub.map(p => {
            let r = null
            if (p.t != null && first.t != null) r = ((1 + p.t / 100) / (1 + first.t / 100) - 1) * 100
            else if (p.c > 0) r = ((p.v - p.c) / p.c) * 100
            return { ...p, r }
        })
    }, [series, range])

    if (series === undefined) return null // z. B. geteilte Ansicht ohne Verlaufsdaten

    if (data.length < 2) {
        return (
            <div style={{ ...cardStyle, color: '#64748b', fontSize: 12 }}>
                📈 Noch keine Verlaufsdaten. Aktualisiere die Daten, damit der Verlauf geladen wird.
            </div>
        )
    }

    const last = data[data.length - 1]
    const hasCapital = data.some(p => p.c != null)
    const gain = last.c != null ? last.v - last.c : null
    const gainPct = last.c > 0 ? (gain / last.c) * 100 : null
    const positive = (mode === 'value' ? gain ?? 0 : last.r ?? 0) >= 0
    const color = mode === 'return' ? (positive ? '#22c55e' : '#ef4444') : '#009991'

    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>📈 Performance</h3>
                    {mode === 'value' ? (
                        <>
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginTop: 6 }}>{eur(last.v)}</div>
                            {gain != null && (
                                <div style={{ fontSize: 12, marginTop: 2, color: gain >= 0 ? '#22c55e' : '#ef4444' }}>
                                    Gewinn gesamt {gain >= 0 ? '+' : ''}{eur(gain)}{gainPct != null ? ` (${pct(gainPct)})` : ''}
                                    <span style={{ color: '#64748b' }}> · eingesetzt {eur(last.c)}</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6 }}>
                                {last.r != null ? pct(last.r) : '—'}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 2, color: '#64748b' }}>
                                Rendite im gewählten Zeitraum
                            </div>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }}>
                    <button onClick={() => setMode('value')} style={btn(mode === 'value')}>Wert</button>
                    <button onClick={() => setMode('return')} style={btn(mode === 'return')}>Rendite</button>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <ComposedChart key={mode} data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e2a3a" vertical={false} />
                    <XAxis
                        dataKey="d" tickFormatter={fmtDate} minTickGap={40}
                        tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                    />
                    <YAxis
                        width={44} domain={['auto', 'auto']}
                        tickFormatter={mode === 'value' ? eurShort : (v) => `${v.toFixed(0)}%`}
                        tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{ background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8' }}
                        labelFormatter={fmtDate}
                        formatter={(val, _name, item) =>
                            item.dataKey === 'r' ? [pct(val), 'Rendite'] : [eur(val), item.dataKey === 'c' ? 'Eingesetzt' : 'Depotwert']}
                    />
                    {mode === 'value' && (
                        <Area type="monotone" dataKey="v" name="Depotwert" stroke={color} strokeWidth={2}
                              fill="url(#perfFill)" dot={false} isAnimationActive={false} />
                    )}
                    {mode === 'value' && hasCapital && (
                        <Line type="monotone" dataKey="c" name="Eingesetzt" stroke="#94a3b8" strokeWidth={1.5}
                              strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    )}
                    {mode === 'return' && (
                        <Area type="monotone" dataKey="r" name="Rendite" stroke={color} strokeWidth={2}
                              fill="url(#perfFill)" dot={false} isAnimationActive={false} />
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'center' }}>
                {RANGES.map(([id, label]) => (
                    <button key={id} onClick={() => setRange(id)} style={btn(range === id)}>{label}</button>
                ))}
            </div>
        </div>
    )
}