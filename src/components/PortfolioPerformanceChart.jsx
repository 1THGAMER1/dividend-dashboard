import React, {useMemo, useState} from 'react'
import {ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid} from 'recharts'


const RANGES = [
    ['1D', '1T'], ['7D', '7T'], ['30D', '30T'], ['3M', '3M'], ['6M', '6M'],
    ['YTD', 'YTD'], ['1Y', '1J'], ['3Y', '3J'], ['MAX', 'Seit Kauf'],
]

const eur = (n) =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency', currency: 'EUR',
        maximumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
        minimumFractionDigits: Math.abs(n) >= 10000 ? 0 : 2,
    }).format(n)

const eurShort = (n) =>
    Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1).replace('.', ',')}k` : `${Math.round(n)}`

const pct = (n) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')} %`)
const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
const fmtDay = (iso) => new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})

function cutoffFor(range, lastDate) {
    const d = new Date(lastDate)
    switch (range) {
        case '1D':
            d.setDate(d.getDate() - 1);
            break
        case '7D':
            d.setDate(d.getDate() - 7);
            break
        case '30D':
            d.setDate(d.getDate() - 30);
            break
        case '3M':
            d.setMonth(d.getMonth() - 3);
            break
        case '6M':
            d.setMonth(d.getMonth() - 6);
            break
        case 'YTD':
            return `${d.getFullYear() - 1}-12-31` // Startpunkt: Schlusswert des Vorjahres
        case '1Y':
            d.setFullYear(d.getFullYear() - 1);
            break
        case '3Y':
            d.setFullYear(d.getFullYear() - 3);
            break
        default:
            return null // Seit Kauf
    }
    return d.toISOString().slice(0, 10)
}

const btn = (active) => ({
    background: active ? '#009991' : 'transparent',
    color: active ? '#fff' : '#64748b',
    border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
})

const toggleWrap = {display: 'flex', background: '#0f1420', padding: 3, borderRadius: 8, border: '1px solid #1e2a3a'}

const cardStyle = {
    background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16,
    padding: 'clamp(12px, 3vw, 20px)',
}

const gainOf = (p, withRealized) =>
    withRealized && p.g != null && p.c > 0 ? (p.g / 100) * p.c : p.v - (p.c ?? 0)

export default function PortfolioPerformanceChart({
                                                      series,
                                                      range: rangeProp,
                                                      onRangeChange,
                                                      portfolioPerformance,
                                                  }) {
    if (Array.isArray(series) && series.length) {
        const n = series.length
        console.table([0, 1, 2, 3, 4, 5, 6, 7].map(i => series[Math.round(i * (n - 1) / 7)]))
    }
    const [ownRange, setOwnRange] = useState('1Y')
    const range = rangeProp ?? ownRange
    const setRange = onRangeChange ?? setOwnRange
    const [mode, setMode] = useState('value')            // 'value' | 'return'
    const [returnType, setReturnType] = useState('simple') // 'simple' | 'twr'
    const [showRealized, setShowRealized] = useState(false)

    const twrSeries = useMemo(
        () => (Array.isArray(series) ? series.map(p => ({...p, twr: p.t ?? 0})) : []),
        [series]
    )

    const data = useMemo(() => {
        if (twrSeries.length < 2) return []
        const cut = cutoffFor(range, twrSeries[twrSeries.length - 1].d)
        let sub = twrSeries
        if (cut) {
            let start = -1
            for (let i = twrSeries.length - 1; i >= 0; i--) {
                if (twrSeries[i].d <= cut) { start = i; break }
            }
            sub = twrSeries.slice(Math.max(start, 0))
        }
        if (sub.length < 2) sub = twrSeries.slice(-2)

        const first = sub[0]
        const gain0 = gainOf(first, showRealized)

        // Roh-Berechnung der Kurve
        const rawPoints = sub.map(p => {
            const r = ((1 + p.twr / 100) / (1 + first.twr / 100) - 1) * 100
            let s = null
            if (range === 'MAX') {
                s = p.c > 0 ? (gainOf(p, showRealized) / p.c) * 100 : null
            } else {
                const netFlow = (p.c ?? 0) - (first.c ?? 0)
                const base = first.v + netFlow > 0 ? first.v + netFlow : first.v
                s = base > 0 ? ((gainOf(p, showRealized) - gain0) / base) * 100 : null
            }
            return { ...p, r, s }
        })

        // Skalierung: Endpunkt der einfachen Rendite exakt an den Parqet-KPI anpassen
        const targetEnd = range === 'MAX' ? null : simpleReturn
        const lastRawS = rawPoints[rawPoints.length - 1]?.s

        if (targetEnd != null && lastRawS && Math.abs(lastRawS) > 0.0001) {
            const factor = targetEnd / lastRawS
            return rawPoints.map(p => ({ ...p, s: p.s != null ? p.s * factor : null }))
        }

        return rawPoints
    }, [twrSeries, range, showRealized, portfolioPerformance])

    if (series === undefined) return null // z. B. geteilte Ansicht ohne Verlaufsdaten

    if (data.length < 2) {
        return (
            <div style={{...cardStyle, color: '#64748b', fontSize: 12}}>
                📈 Noch keine Verlaufsdaten. Aktualisiere die Daten, damit der Verlauf geladen wird.
            </div>
        )
    }
    const first = data[0]
    const last = data[data.length - 1]
    console.log(
        '[Chart Zeitraum]',
        range,
        'Stichtag:',
        cutoffFor(range, last.d),
        'Punkte:',
        data.length
    )
    console.table([
        { punkt: 'Start', ...first },
        { punkt: 'Ende', ...last },
    ])

    const hasCapital = data.some(p => p.c != null)
    // Gewinn im gewählten Zeitraum (bei Max = Gesamtgewinn)
    const unrealizedGain = portfolioPerformance?.unrealizedGain
    const realizedGain = portfolioPerformance?.realizedGain

    const gainRange = unrealizedGain == null
        ? null
        : showRealized
            ? realizedGain == null ? null : unrealizedGain + realizedGain
            : unrealizedGain

    const baseCapital = (unrealizedGain != null && portfolioPerformance?.unrealizedReturn)
        ? (unrealizedGain / (portfolioPerformance.unrealizedReturn / 100))
        : null

    const simpleReturn = range === 'MAX'
        ? (showRealized ? last.g : (last.c > 0 ? ((last.v - last.c) / last.c) * 100 : null))
        : (showRealized
            ? (baseCapital && gainRange != null ? (gainRange / baseCapital) * 100 : null)
            : portfolioPerformance?.unrealizedReturn ?? null)

    const retKey = returnType === 'twr' ? 'r' : 's'
    const retValue = returnType === 'twr' ? last.r : simpleReturn
    const positive = (mode === 'value' ? gainRange : retValue ?? 0) >= 0
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
                    <h3 style={{fontSize: 16, fontWeight: 600, margin: 0, color: '#f1f5f9'}}>📈 Performance</h3>

                    {mode === 'value' ? (
                        <>
                            <div style={{
                                fontSize: 22,
                                fontWeight: 700,
                                color: '#f1f5f9',
                                marginTop: 6
                            }}>{eur(last.v)}</div>
                            <div style={{fontSize: 12, marginTop: 2, color: gainRange >= 0 ? '#22c55e' : '#ef4444'}}>
                                {range === 'MAX' ? 'Gewinn seit Kauf' : 'Gewinn im Zeitraum'}{' '}
                                {gainRange == null
                                    ? '—'
                                    : `${gainRange >= 0 ? '+' : ''}${eur(gainRange)}`}
                                {' '}({pct(simpleReturn)})
                                {last.c != null && <span style={{color: '#64748b'}}> · investiert {eur(last.c)}</span>}
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{fontSize: 22, fontWeight: 700, color, marginTop: 6}}>{pct(retValue)}</div>
                            <div style={{fontSize: 12, marginTop: 2, color: '#64748b'}}>
                                Einfach <span style={{color: (simpleReturn ?? 0) >= 0 ? '#22c55e' : '#ef4444'}}>
    {pct(simpleReturn)}
</span>
                                {' · '}
                                TTWROR <span
                                style={{color: (last.r ?? 0) >= 0 ? '#22c55e' : '#ef4444'}}>{pct(last.r)}</span>
                            </div>
                        </>
                    )}
                </div>

                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6}}>
                    <div style={toggleWrap}>
                        <button onClick={() => setMode('value')} style={btn(mode === 'value')}>Wert</button>
                        <button onClick={() => setMode('return')} style={btn(mode === 'return')}>Rendite</button>
                    </div>
                    <div style={toggleWrap}>
                        <button onClick={() => setShowRealized(v => !v)} style={btn(showRealized)}>
                            Realisiert {showRealized ? 'an' : 'aus'}
                        </button>
                    </div>
                    {mode === 'return' && (
                        <div style={toggleWrap}>
                            <button onClick={() => setReturnType('simple')}
                                    style={btn(returnType === 'simple')}>Einfach
                            </button>
                            <button onClick={() => setReturnType('twr')} style={btn(returnType === 'twr')}>TTWROR
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <ComposedChart key={`${mode}-${returnType}`} data={data}
                               margin={{top: 8, right: 4, left: 0, bottom: 0}}>
                    <defs>
                        <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.35}/>
                            <stop offset="100%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e2a3a" vertical={false}/>
                    <XAxis
                        dataKey="d" tickFormatter={['1D', '7D', '30D'].includes(range) ? fmtDay : fmtDate}
                        minTickGap={40}
                        tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false}
                    />
                    <YAxis
                        width={44} domain={['auto', 'auto']}
                        tickFormatter={mode === 'value' ? eurShort : (v) => `${v.toFixed(0)}%`}
                        tick={{fill: '#64748b', fontSize: 10}} axisLine={false} tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{background: '#161b27', borderColor: '#2a3a50', borderRadius: 8, fontSize: 12}}
                        labelStyle={{color: '#94a3b8'}}
                        labelFormatter={fmtDate}
                        formatter={(val, _name, item) => {
                            if (item.dataKey === 'r') return [pct(val), 'TTWROR']
                            if (item.dataKey === 's') return [pct(val), 'Rendite (einfach)']
                            return [eur(val), item.dataKey === 'c' ? 'Investiert' : 'Depotwert']
                        }}
                    />
                    {mode === 'value' && (
                        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
                              fill="url(#perfFill)" dot={false} isAnimationActive={false}/>
                    )}
                    {mode === 'value' && hasCapital && (
                        <Line type="monotone" dataKey="c" stroke="#94a3b8" strokeWidth={1.5}
                              strokeDasharray="4 4" dot={false} isAnimationActive={false}/>
                    )}
                    {mode === 'return' && (
                        <Area type="monotone" dataKey={retKey} stroke={color} strokeWidth={2}
                              fill="url(#perfFill)" dot={false} isAnimationActive={false} connectNulls />
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, justifyContent: 'center'}}>
                {RANGES.map(([id, label]) => (
                    <button key={id} onClick={() => setRange(id)} style={btn(range === id)}>{label}</button>
                ))}
            </div>
        </div>
    )
}