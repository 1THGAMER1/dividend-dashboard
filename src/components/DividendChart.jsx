import { useState, useMemo } from 'react'
import {
    ComposedChart, Bar, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { MONTHS, YEAR_COLORS } from '../utils/dataUtils.js'

function taxRateForHolding(holding) {
    if (!holding) return 0
    let totalNet = 0
    let totalGross = 0
    for (const year of Object.values(holding.monthly || {})) {
        for (const v of year) totalNet += v || 0
    }
    for (const year of Object.values(holding.gross || {})) {
        for (const v of year) totalGross += v || 0
    }
    if (totalGross <= 0 || totalNet <= 0) return 0
    return Math.max(0, Math.min(1, 1 - totalNet / totalGross))
}

function toGross(netValue, taxRate) {
    if (taxRate <= 0 || taxRate >= 1) return netValue
    return netValue / (1 - taxRate)
}

function calcBarSize(totalPoints) {
    if (totalPoints <= 12)  return 20
    if (totalPoints <= 24)  return 14
    if (totalPoints <= 36)  return 10
    if (totalPoints <= 48)  return 7
    return 5
}

function calcXInterval(totalPoints) {
    if (totalPoints <= 12)  return 0
    if (totalPoints <= 24)  return 1
    if (totalPoints <= 36)  return 2
    if (totalPoints <= 60)  return 5
    return Math.ceil(totalPoints / 12) - 1
}

export default function DividendChart({ monthly, forecastMonthly, byHolding, forecastByHolding }) {
    const [mode, setMode] = useState('monthly') // 'monthly' | 'stacked'
    const [showGross, setShowGross] = useState(false)

    const cy = new Date().getFullYear()
    const cm = new Date().getMonth()
    const years = Object.keys(monthly || {}).map(Number).sort()

    const fmCy = forecastMonthly?.[cy] || Array(12).fill(0)

    const globalTaxRate = useMemo(() => {
        let totalNet = 0, totalGross = 0
        for (const h of Object.values(byHolding || {})) {
            for (const year of Object.values(h.monthly || {})) for (const v of year) totalNet   += v || 0
            for (const year of Object.values(h.gross  || {})) for (const v of year) totalGross += v || 0
        }
        if (totalGross <= 0 || totalNet <= 0) return 0
        return Math.max(0, Math.min(1, 1 - totalNet / totalGross))
    }, [byHolding])

    const taxRates = useMemo(() => {
        const map = {}
        for (const [isin, h] of Object.entries(byHolding || {})) {
            map[isin] = taxRateForHolding(h)
        }
        return map
    }, [byHolding])

    const scaleNet  = (v)       => showGross ? toGross(v, globalTaxRate) : v
    const scaleIsin = (v, isin) => showGross ? toGross(v, taxRates[isin] ?? globalTaxRate) : v

    // 1. MONATLICHE BALKEN
    const monthlyBarData = MONTHS.map((name, i) => {
        const pt = { name }
        years.forEach(y => {
            const raw = y < cy
                ? (monthly[y]?.[i] || 0)
                : (i < cm ? (monthly[y]?.[i] || 0) : null)
            pt[String(y)] = raw !== null ? +scaleNet(raw).toFixed(2) : null
        })
        if (i >= cm) pt['prognose'] = +scaleNet(fmCy[i] || 0).toFixed(2)
        return pt
    })

    // Alle ISINs erfassen, die entweder historische Dividenden ODER Prognosewerte haben
    const isins = useMemo(() => {
        const all = new Set([
            ...Object.keys(byHolding || {}),
            ...Object.keys(forecastByHolding || {})
        ])
        return [...all].filter(isin => {
            const h = byHolding?.[isin]
            const hasHistory = h && Object.values(h.monthly || {}).some(months =>
                Object.values(months).some(v => v > 0)
            )
            const hasForecast = forecastByHolding?.[isin] && Object.values(forecastByHolding[isin]).some(v => v > 0)
            return hasHistory || hasForecast
        })
    }, [byHolding, forecastByHolding])

    // 2. NACH AKTIE (STACKED)
    const allYears  = isins.flatMap(isin => Object.keys(byHolding?.[isin]?.monthly || {}).map(Number))
    const minYear   = allYears.length ? Math.min(...allYears) : cy
    const startDate = new Date(minYear, 0, 1)
    const endDate   = new Date(cy, cm + 12, 1)
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
        + endDate.getMonth() - startDate.getMonth()

    const rawMonthTotals = []

    const stackedDataRaw = Array.from({ length: totalMonths }, (_, i) => {
        const date     = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
        const year     = date.getFullYear()
        const month    = date.getMonth()
        const isFuture = date >= new Date(cy, cm, 1)
        const isJan    = month === 0

        // Eindeutiger Key pro Monat/Jahr verhindert Vertauschungen in Recharts
        const key = `${year}-${String(month + 1).padStart(2, '0')}`
        const label = isJan ? `Jan '${String(year).slice(2)}` : MONTHS[month].slice(0, 3)
        const fullLabel = `${MONTHS[month]} ${year}`

        const pt = {
            key,
            name: key,
            displayLabel: label,
            fullLabel,
            _future: isFuture
        }

        let monthSum = 0
        for (const isin of isins) {
            const h   = byHolding?.[isin]
            const raw = isFuture
                ? (forecastByHolding?.[isin]?.[month] || 0)
                : (h?.monthly?.[year]?.[month] || 0)
            const val = +scaleIsin(raw, isin).toFixed(2)
            pt[isin] = val
            monthSum += val
        }
        pt._total = monthSum
        if (!isFuture) rawMonthTotals.push(monthSum)
        return pt
    })
    const firstActiveIdx = rawMonthTotals.findIndex(v => v > 0)
    const activeHistoricalMonths = firstActiveIdx >= 0 ? rawMonthTotals.slice(firstActiveIdx) : []

    const intervalAvg = activeHistoricalMonths.length > 0
        ? +(activeHistoricalMonths.reduce((a, b) => a + b, 0) / activeHistoricalMonths.length).toFixed(2)
        : null

    const stackedData = stackedDataRaw.map((pt, i) => {
        let ttm = null
        if (!pt._future) {
            const startIdx = Math.max(0, i - 11)
            const window = stackedDataRaw.slice(startIdx, i + 1).filter(p => !p._future)
            const sum = window.reduce((s, p) => s + (p._total || 0), 0)
            ttm = +(sum / Math.min(12, window.length)).toFixed(2)
        }
        return {
            ...pt,
            intervalAvg: intervalAvg,
            ttmAvg: ttm,
        }
    })

    const stackedBarSize = calcBarSize(totalMonths)
    const stackedXInterval = calcXInterval(totalMonths)

    const maxVal = Math.max(
        ...monthlyBarData.flatMap(d =>
            [...years.map(y => d[String(y)] || 0), d['prognose'] || 0]
        )
    ) * 1.1

    const label = showGross ? 'Brutto' : 'Netto'
    const fmtTip = v => `${(+v).toFixed(2)} € (${label})`

    const pillBase   = { padding:'5px 12px', borderRadius:20, fontSize:12, cursor:'pointer', border:'1px solid #2a3a50', background:'transparent', color:'#7a8ba0', fontWeight:600 }
    const pillActive = { ...pillBase, background:'#1e3a5f', color:'#93c5fd' }
    const grossActive= { ...pillBase, background:'rgba(251,146,60,0.12)', border:'1px solid #fb923c', color:'#fb923c' }

    return (
        <div style={{ background:'#161b27', borderRadius:16, padding:20, border:'1px solid #1e2a3a' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                <div>
                    <h3 style={{ fontSize:16, fontWeight:600, color:'#f1f5f9', margin:0 }}>
                        📊 {mode === 'monthly' ? 'Monatliche Dividenden' : 'Dividenden nach Einzelwerten'}
                    </h3>
                    <p style={{ color:'#64748b', fontSize:12, margin:'2px 0 0 0' }}>
                        {mode === 'monthly' ? 'Vergleich der Monate im Jahresverlauf' : 'Historische & prognostizierte Cashflows mit TTM-Durchschnitt'}
                    </p>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:3, padding:'2px', background:'#0f1420', borderRadius:22, border:'1px solid #1e2a3a' }}>
                        <button onClick={() => setShowGross(false)} style={!showGross ? pillActive : pillBase}>Netto</button>
                        <button onClick={() => setShowGross(true)}  style={ showGross ? grossActive : pillBase}>Brutto</button>
                    </div>

                    <div style={{ display:'flex', gap:4, background:'#0f1420', padding:'2px', borderRadius:22, border:'1px solid #1e2a3a' }}>
                        <button onClick={() => setMode('monthly')} style={mode === 'monthly' ? pillActive : pillBase}>Monatlich</button>
                        <button onClick={() => setMode('stacked')} style={mode === 'stacked' ? pillActive : pillBase}>Nach Aktie</button>
                    </div>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={290}>
                {mode === 'monthly' ? (
                    <ComposedChart data={monthlyBarData} margin={{ top:8, right:16, left:0, bottom:0 }} barCategoryGap="20%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill:'#7a8ba0', fontSize:11 }} tickLine={false} axisLine={{ stroke:'#1e2a3a' }} />
                        <YAxis tick={{ fill:'#7a8ba0', fontSize:11 }} tickFormatter={v => v.toFixed(0) + '€'} width={48} domain={[0, maxVal]} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ background:'#161b27', border:'1px solid #2a3a50', borderRadius:8, fontSize:12 }}
                            labelStyle={{ color:'#f1f5f9', fontWeight:600 }}
                            formatter={(v, n) => [fmtTip(v), n === 'prognose' ? 'Prognose' : n]}
                            cursor={{ fill:'rgba(255,255,255,0.03)' }}
                        />
                        <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }} />
                        {years.map(y => (
                            <Bar key={y} dataKey={String(y)} fill={YEAR_COLORS[y] || '#94a3b8'}
                                 radius={[3,3,0,0]} maxBarSize={22} name={String(y)} />
                        ))}
                        <Bar dataKey="prognose" name="Prognose"
                             fill={YEAR_COLORS[cy] || '#c0397a'} maxBarSize={22}
                             shape={(props) => {
                                 const { x, y, width, height } = props
                                 if (!height || height <= 0) return null
                                 return (
                                     <rect x={x} y={y} width={width} height={height}
                                           fill={YEAR_COLORS[cy] || '#c0397a'}
                                           fillOpacity={0.35} rx={3} />
                                 )
                             }}
                        />
                    </ComposedChart>
                ) : (
                    <ComposedChart
                        data={stackedData}
                        margin={{ top:8, right:16, left:0, bottom:0 }}
                        barCategoryGap="15%"
                        barSize={stackedBarSize}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" vertical={false} />
                        <XAxis
                            dataKey="key"
                            tick={{ fill:'#7a8ba0', fontSize:10 }}
                            tickLine={false}
                            axisLine={{ stroke:'#1e2a3a' }}
                            interval={stackedXInterval}
                            tickFormatter={(k) => {
                                const pt = stackedData.find(d => d.key === k)
                                return pt?.displayLabel || k
                            }}
                        />
                        <YAxis tick={{ fill:'#7a8ba0', fontSize:11 }} tickFormatter={v => v.toFixed(0) + '€'} width={48} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ background:'#161b27', border:'1px solid #2a3a50', borderRadius:8 }}
                            content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null
                                const pt = payload[0]?.payload
                                const filtered = payload.filter(p => p.value > 0 && p.dataKey !== 'intervalAvg' && p.dataKey !== 'ttmAvg')
                                const ttmPt = payload.find(p => p.dataKey === 'ttmAvg')
                                const monthTotal = filtered.reduce((s, p) => s + (+p.value || 0), 0)

                                return (
                                    <div style={{ background:'#161b27', border: '1px solid #2a3a50', borderRadius:8, padding:'10px 14px', fontSize:12, minWidth:160 }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6, borderBottom:'1px solid #1e2a3a', paddingBottom:4 }}>
                                            <span style={{ color:'#f1f5f9', fontWeight:700, fontSize:13 }}>{pt?.fullLabel}</span>
                                            {monthTotal > 0 && (
                                                <span style={{ color:'#22c55e', fontWeight:700 }}>{monthTotal.toFixed(2)} €</span>
                                            )}
                                        </div>

                                        {ttmPt && ttmPt.value != null && (
                                            <p style={{ color:'#38bdf8', margin:'0 0 2px', fontWeight:600 }}>
                                                Ø monatl. Einkommen (TTM): {(+ttmPt.value).toFixed(2)} €
                                            </p>
                                        )}
                                        {pt?.intervalAvg != null && (
                                            <p style={{ color:'#94a3b8', margin:'0 0 6px', fontSize:11 }}>
                                                Ø Dividende im Intervall: {(+pt.intervalAvg).toFixed(2)} €
                                            </p>
                                        )}

                                        {filtered.length === 0 ? (
                                            <p style={{ color:'#64748b', margin:'2px 0', fontSize:11 }}>Keine Ausschüttungen</p>
                                        ) : (
                                            filtered.map(p => (
                                                <div key={p.dataKey} style={{ display:'flex', justifyContent:'space-between', gap:10, margin:'3px 0' }}>
                                                    <span style={{ color: p.fill, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:220 }}>
                                                        {byHolding?.[p.dataKey]?.name || p.dataKey}
                                                    </span>
                                                    <span style={{ color:'#f1f5f9', fontWeight:600, flexShrink:0 }}>
                                                        {(+p.value).toFixed(2)} €
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )
                            }}
                            cursor={{ fill:'rgba(255,255,255,0.03)' }}
                        />
                        <Legend
                            wrapperStyle={{ fontSize:11, maxHeight:50, overflowY:'auto', paddingTop:8 }}
                            formatter={val => {
                                if (val === 'intervalAvg') {
                                    return (
                                        <span style={{ color:'#94a3b8', fontWeight:600 }}>
                                            ---- Ø Dividende im Intervall {intervalAvg != null ? `(${intervalAvg.toFixed(2)} €)` : ''}
                                        </span>
                                    )
                                }
                                if (val === 'ttmAvg') return <span style={{ color:'#38bdf8' }}>— Ø monatl. Einkommen (TTM)</span>
                                return <span style={{ color:'#94a3b8' }}>{byHolding?.[val]?.name || val}</span>
                            }}
                        />
                        {isins.map((isin, idx) => {
                            const color     = byHolding?.[isin]?.color || '#94a3b8'
                            const isTopmost = idx === isins.length - 1
                            return (
                                <Bar key={isin} dataKey={isin} stackId="a"
                                     fill={color}
                                     radius={isTopmost ? [3,3,0,0] : [0,0,0,0]}
                                     shape={(props) => {
                                         const isFuture = stackedData[props.index]?._future || false
                                         const { x, y, width, height } = props
                                         if (height <= 0) return null
                                         return (
                                             <rect
                                                 x={x} y={y} width={width} height={height}
                                                 fill={color}
                                                 fillOpacity={isFuture ? 0.35 : 1}
                                                 rx={isTopmost ? 3 : 0}
                                                 ry={isTopmost ? 3 : 0}
                                             />
                                         )
                                     }}
                                />
                            )
                        })}

                        <Line
                            type="monotone"
                            dataKey="intervalAvg"
                            stroke="#64748b"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            name="intervalAvg"
                            isAnimationActive={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="ttmAvg"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={false}
                            name="ttmAvg"
                            connectNulls
                            isAnimationActive={false}
                        />
                    </ComposedChart>
                )}
            </ResponsiveContainer>

            {mode === 'stacked' && (
                <p style={{ color:'#64748b', fontSize:11, marginTop:8, marginBottom:0 }}>
                    <span style={{ color:'#38bdf8' }}>— TTM:</span> Rollierender 12-Monats-Schnitt · <span style={{ color:'#94a3b8' }}>---- Intervall:</span> {intervalAvg != null ? `${intervalAvg.toFixed(2)} € / Monat` : '–'} · Halbtransparent = Prognose
                </p>
            )}
        </div>
    )
}