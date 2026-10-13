import React, { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { fetchHoldingHistory } from '../api'

const RANGES = [['1M', 1], ['6M', 6], ['1J', 12], ['MAX', null]]

const eur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0)
const pct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`)
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
const num = (v) => parseFloat(String(v ?? 0).replace(',', '.')) || 0

const btn = (active) => ({
    background: active ? '#009991' : 'transparent',
    color: active ? '#fff' : '#64748b',
    border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
})
const toggleWrap = { display: 'flex', background: '#0c1019', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a' }

// Grüner Punkt = Kauf, roter Punkt = Verkauf
const markerDot = ({ cx, cy, payload, index }) =>
    payload?.buy || payload?.sell
        ? <circle key={index} cx={cx} cy={cy} r={3.5} fill={payload.sell ? '#ef4444' : '#22c55e'} stroke="#161b27" strokeWidth={1.5} />
        : <g key={index} />

export default function HoldingPriceChart({ symbol, activities = [] }) {
    const [loaded, setLoaded] = useState(null) // null = lädt
    const [mode, setMode] = useState('value')  // 'value' | 'price'
    const [range, setRange] = useState('MAX')

    useEffect(() => {
        let cancelled = false
        setLoaded(null)
        fetchHoldingHistory(symbol).then(r => { if (!cancelled) setLoaded(r) })
        return () => { cancelled = true }
    }, [symbol])

    // Anteile und Einstand an jedem Tag aus Käufen/Verkäufen nachrechnen
    const data = useMemo(() => {
        const history = loaded?.history || []
        const splits = loaded?.splits || []
        if (!history.length) return []

        const day = (a) => String(a.datetime || '').slice(0, 10)
        // Yahoo-Kurse sind splitbereinigt → Stückzahlen vor einem Split ebenfalls umrechnen
        const adjShares = (a) => num(a.shares ?? a.quantity) * splits.reduce(
            (f, s) => (s?.date && s.ratio > 0 && day(a) < s.date ? f * s.ratio : f), 1)

        const acts = activities
            .filter(a => a._type === 'BUY' || a._type === 'SELL')
            .map(a => ({ d: day(a), type: a._type, shares: adjShares(a), amount: num(a.amount ?? a.total) }))
            .filter(a => a.d)
            .sort((a, b) => a.d.localeCompare(b.d))

        const firstBuy = acts[0]?.d
        let i = 0, shares = 0, cost = 0
        const out = []

        for (const p of history) {
            let buy = false, sell = false
            while (i < acts.length && acts[i].d <= p.d) {
                const a = acts[i++]
                if (a.type === 'BUY') { shares += a.shares; cost += a.amount; buy = true }
                else {
                    const avg = shares > 0 ? cost / shares : 0
                    const sold = Math.min(a.shares, shares)
                    shares -= sold; cost -= avg * sold; sell = true
                }
            }
            if (firstBuy && p.d < firstBuy) continue
            out.push({ d: p.d, price: p.close, value: shares * p.close, cost: shares > 1e-9 ? cost : 0, buy, sell })
        }
        return out
    }, [loaded, activities])

    const shown = useMemo(() => {
        const months = RANGES.find(r => r[0] === range)?.[1]
        if (!months || data.length < 2) return data
        const c = new Date(data[data.length - 1].d)
        c.setMonth(c.getMonth() - months)
        const cut = c.toISOString().slice(0, 10)
        const sub = data.filter(p => p.d >= cut)
        return sub.length >= 2 ? sub : data.slice(-2)
    }, [data, range])

    const card = { background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 12, padding: 14 }

    if (loaded === null) return <div style={{ ...card, color: '#64748b', fontSize: 12 }}>Kursverlauf wird geladen…</div>
    if (shown.length < 2) return <div style={{ ...card, color: '#64748b', fontSize: 12 }}>Für diesen Wert sind keine Kursdaten verfügbar.</div>

    const first = shown[0]
    const last = shown[shown.length - 1]
    const priceChange = first.price > 0 ? (last.price / first.price - 1) * 100 : null
    const gain = last.value - last.cost
    const gainPct = last.cost > 0 ? (gain / last.cost) * 100 : null
    const headline = mode === 'price' ? priceChange : gainPct
    const color = (headline ?? 0) >= 0 ? '#22c55e' : '#ef4444'
    const key = mode === 'price' ? 'price' : 'value'

    return (
        <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>
                        {eur(mode === 'price' ? last.price : last.value)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color, marginTop: 2 }}>
                        {mode === 'price'
                            ? `${pct(priceChange)} im Zeitraum`
                            : `${gain >= 0 ? '+' : ''}${eur(gain)} (${pct(gainPct)}) auf Einstand`}
                    </div>
                </div>
                <div style={toggleWrap}>
                    <button onClick={() => setMode('value')} style={btn(mode === 'value')}>Wert</button>
                    <button onClick={() => setMode('price')} style={btn(mode === 'price')}>Kurs</button>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={shown} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="holdingFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e2a3a" vertical={false} />
                    <XAxis dataKey="d" tickFormatter={fmtDate} minTickGap={40}
                           tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis width={52} domain={['auto', 'auto']}
                           tickFormatter={(v) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : Math.round(v)}
                           tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                        contentStyle={{ background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8' }}
                        labelFormatter={fmtDate}
                        formatter={(val, _n, item) => {
                            const p = item.payload
                            const tag = p.buy ? ' · Kauf' : p.sell ? ' · Verkauf' : ''
                            if (item.dataKey === 'cost') return [eur(val), 'Einstand']
                            if (item.dataKey === 'price') return [eur(val) + tag, 'Kurs']
                            const diff = p.value - p.cost
                            return [`${eur(val)} (${diff >= 0 ? '+' : ''}${eur(diff)})${tag}`, 'Wert']
                        }}
                    />
                    <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2}
                          fill="url(#holdingFill)" dot={markerDot} activeDot={{ r: 4 }} isAnimationActive={false} />
                    {mode === 'value' && (
                        <Line type="stepAfter" dataKey="cost" stroke="#94a3b8" strokeWidth={1.5}
                              strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {RANGES.map(([id]) => (
                    <button key={id} onClick={() => setRange(id)} style={btn(range === id)}>
                        {id === 'MAX' ? 'Seit Kauf' : id}
                    </button>
                ))}
            </div>
        </div>
    )
}