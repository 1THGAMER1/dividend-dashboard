import { useState, useMemo } from 'react'
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { MONTHS, YEAR_COLORS } from '../dataUtils'
import { cumulativeInflationFactor, inflationRate } from '../inflation'

const MODES = [
    { key: 'monthly',    label: 'Monatlich' },
    { key: 'stacked',    label: 'Nach Aktie' },
    { key: 'cumulative', label: 'Akkumuliert' },
]

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

// Berechnet die ideale Balkenbreite basierend auf der Anzahl Datenpunkte
function calcBarSize(totalPoints) {
    if (totalPoints <= 12)  return 20
    if (totalPoints <= 24)  return 14
    if (totalPoints <= 36)  return 10
    if (totalPoints <= 48)  return 7
    return 5
}

// Berechnet sinnvollen X-Achsen-Intervall damit Labels nicht überlappen
function calcXInterval(totalPoints) {
    if (totalPoints <= 12)  return 0        // alle Labels
    if (totalPoints <= 24)  return 1        // jeden 2. (Jan, Jan, ...)
    if (totalPoints <= 36)  return 2
    if (totalPoints <= 60)  return 5        // jeden 6.
    return Math.ceil(totalPoints / 12) - 1 // ~12 Labels gesamt
}

export default function DividendChart({ monthly, cum, forecastCum, forecastMonthly, byHolding, forecastByHolding }) {
    const [mode,      setMode]      = useState('monthly')
    const [showGross, setShowGross] = useState(false)
    const [showInflation, setShowInflation] = useState(false)

    const cy    = new Date().getFullYear()
    const ny    = cy + 1
    const cm    = new Date().getMonth()
    const years = Object.keys(monthly).map(Number).sort()
    const baseYear = years[0] ?? cy

    const fcCy = forecastCum?.[cy]     || Array(12).fill(null)
    const fcNy = forecastCum?.[ny]     || Array(12).fill(null)
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

    // ── Inflationslinie für Akkumuliert-Modus ──────────────────────────────────
    const inflationLineData = useMemo(() => {
        if (!years.length || years.length < 2) return null
        const firstYearTotal = (monthly[baseYear] || []).reduce((s, v) => s + (v || 0), 0)
        if (firstYearTotal <= 0) return null
        const yearTargets = {}
        years.forEach(y => {
            yearTargets[y] = firstYearTotal * cumulativeInflationFactor(baseYear, y)
        })
        let cumTarget = 0
        const cumTargets = {}
        years.forEach(y => {
            cumTarget += yearTargets[y]
            cumTargets[y] = cumTarget
        })
        return cumTargets
    }, [monthly, years, baseYear])

    const inflationRefValue = inflationLineData?.[cy] ?? null

    // Monatlich
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

    // Akkumuliert
    const cumLineData = MONTHS.map((name, i) => {
        const pt = { name }
        years.filter(y => y < cy).forEach(y => {
            pt[String(y)] = +scaleNet(cum[y]?.[i] || 0).toFixed(2)
        })
        pt[`${cy}_real`]     = i <= cm - 1 ? +scaleNet(fcCy[i] ?? 0).toFixed(2) : null
        pt[`${cy}_forecast`] = i >= cm - 1 ? +scaleNet(fcCy[i] ?? 0).toFixed(2) : null
        pt[`${ny}_forecast`] = fcNy[i] != null ? +scaleNet(fcNy[i]).toFixed(2) : null
        if (showInflation && inflationLineData && years.length >= 2) {
            const yearKeys = years.filter(y => y <= cy)
            let runningInflation = 0
            yearKeys.forEach((y, yIdx) => {
                const yearTarget = inflationLineData[y] ?? 0
                if (y < cy) {
                    runningInflation += yearTarget - (yIdx > 0 ? (inflationLineData[years[yIdx - 1]] ?? 0) : 0)
                } else {
                    const prevCum = yIdx > 0 ? (inflationLineData[years[yIdx - 1]] ?? 0) : 0
                    const curTarget = inflationLineData[y] ?? 0
                    const monthShare = i <= cm - 1 ? (i + 1) / 12 : (cm) / 12
                    runningInflation += (curTarget - prevCum) * monthShare
                }
            })
            pt['inflation_target'] = i <= cm - 1 ? +runningInflation.toFixed(2) : null
        }
        return pt
    })

    // Nach Aktie
    const isins = Object.keys(byHolding || {}).filter(isin => {
        const h = byHolding[isin]
        return Object.values(h.monthly || {}).some(months =>
            Object.values(months).some(v => v > 0)
        )
    })

    const allYears  = isins.flatMap(isin => Object.keys(byHolding[isin].monthly || {}).map(Number))
    const minYear   = allYears.length ? Math.min(...allYears) : cy
    const startDate = new Date(minYear, 0, 1)
    const endDate   = new Date(cy, cm + 12, 1)
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
        + endDate.getMonth() - startDate.getMonth()

    const stackedData = Array.from({ length: totalMonths }, (_, i) => {
        const date     = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
        const year     = date.getFullYear()
        const month    = date.getMonth()
        const isFuture = date >= new Date(cy, cm, 1)
        // Kurzes Label: "Jan" für Jan, "J '26" für Jahreswechsel
        const isJan    = month === 0
        const label    = isJan
            ? `Jan '${String(year).slice(2)}`
            : MONTHS[month].slice(0, 3)
        const pt       = { name: label, _future: isFuture }
        for (const isin of isins) {
            const h   = byHolding[isin]
            const raw = isFuture
                ? (forecastByHolding?.[isin]?.[month] || 0)
                : (h.monthly[year]?.[month] || 0)
            pt[isin] = +scaleIsin(raw, isin).toFixed(2)
        }
        return pt
    })

    // Dynamische Werte für stacked Chart
    const stackedBarSize = calcBarSize(totalMonths)
    const stackedXInterval = calcXInterval(totalMonths)

    const maxVal = Math.max(
        ...monthlyBarData.flatMap(d =>
            [...years.map(y => d[String(y)] || 0), d['prognose'] || 0]
        )
    ) * 1.1

    const label = showGross ? 'Brutto' : 'Netto'
    const fmtTip = v => `${(+v).toFixed(2)} € (${label})`

    const renderLineLegend = value => {
        if (value === 'inflation_target') return <span style={{ color: '#f97316' }}>Inflation (Ziel)</span>
        const color = value === `${cy}_real`     ? YEAR_COLORS[cy] || '#f472b6'
            : value === `${cy}_forecast` ? YEAR_COLORS[cy] || '#f472b6'
                : value === `${ny}_forecast` ? '#34d399'
                    : YEAR_COLORS[+value]        || '#94a3b8'
        const lbl = value === `${cy}_real`     ? String(cy)
            : value === `${cy}_forecast` ? 'Prognose'
                : value === `${ny}_forecast` ? `${ny} Prognose`
                    : value
        return <span style={{ color }}>{lbl}</span>
    }

    const pillBase    = { padding:'5px 14px', borderRadius:20, fontSize:12, cursor:'pointer', border:'1px solid #2a3a50', background:'transparent', color:'#7a8ba0' }
    const pillActive  = { ...pillBase, background:'#1e3a5f', color:'#93c5fd' }
    const grossActive = { ...pillBase, background:'rgba(251,146,60,0.12)', border:'1px solid #fb923c', color:'#fb923c' }
    const inflActive  = { ...pillBase, background:'rgba(249,115,22,0.12)', border:'1px solid #f97316', color:'#f97316' }

    const canShowInflation = mode === 'cumulative' && years.length >= 2 && inflationLineData !== null

    return (
        <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0' }}>Jahresverlauf</h2>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {/* Netto / Brutto */}
                    <div style={{ display:'flex', gap:4, padding:'2px', background:'#0f1420', borderRadius:22, border:'1px solid #1e2a3a' }}>
                        <button onClick={() => setShowGross(false)} style={!showGross ? pillActive : pillBase}>Netto</button>
                        <button onClick={() => setShowGross(true)}  style={ showGross ? grossActive : pillBase}>Brutto</button>
                    </div>
                    {/* Ansichts-Tabs */}
                    <div style={{ display:'flex', gap:4 }}>
                        {MODES.map(({ key }) => (
                            <button key={key} onClick={() => setMode(key)} style={mode === key ? pillActive : pillBase}>
                                {key === 'monthly' ? 'Monatlich' : key === 'stacked' ? 'Nach Aktie' : 'Akkumuliert'}
                            </button>
                        ))}
                    </div>
                    {/* Inflation-Toggle — nur im Akkumuliert-Modus */}
                    {canShowInflation && (
                        <button onClick={() => setShowInflation(v => !v)} style={showInflation ? inflActive : pillBase}>
                            📉 Inflation
                        </button>
                    )}
                </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                {mode === 'monthly' ? (
                    <BarChart data={monthlyBarData} margin={{ top:8, right:16, left:0, bottom:0 }} barCategoryGap="20%" barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a2233" />
                        <XAxis dataKey="name" tick={{ fill:'#7a8ba0', fontSize:12 }} tickLine={{ stroke:'#2a3a50' }} dx={-12} />
                        <YAxis tick={{ fill:'#7a8ba0', fontSize:12 }} tickFormatter={v => v.toFixed(0) + '€'} width={52} domain={[0, maxVal]} />
                        <Tooltip
                            contentStyle={{ background:'#1a2233', border:'1px solid #222d3d', borderRadius:8 }}
                            labelStyle={{ color:'#c8d4e0' }}
                            formatter={(v, n) => [fmtTip(v), n === 'prognose' ? 'Prognose' : n]}
                            cursor={{ fill:'rgba(255,255,255,0.04)' }}
                        />
                        <Legend wrapperStyle={{ fontSize:13, color:'#c8d4e0' }} />
                        {years.map(y => (
                            <Bar key={y} dataKey={String(y)} fill={YEAR_COLORS[y] || '#94a3b8'}
                                 radius={[3,3,0,0]} maxBarSize={20} name={String(y)} />
                        ))}
                        <Bar dataKey="prognose" name="Prognose"
                             fill={YEAR_COLORS[cy] || '#f472b6'} maxBarSize={20}
                             shape={(props) => {
                                 const { x, y, width, height } = props
                                 if (!height || height <= 0) return null
                                 return (
                                     <rect x={x} y={y} width={width} height={height}
                                           fill={YEAR_COLORS[cy] || '#f472b6'}
                                           fillOpacity={0.35} rx={3} />
                                 )
                             }}
                        />
                    </BarChart>

                ) : mode === 'stacked' ? (
                    <BarChart
                        data={stackedData}
                        margin={{ top:8, right:16, left:0, bottom:0 }}
                        barCategoryGap="15%"
                        barSize={stackedBarSize}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a2233" />
                        <XAxis
                            dataKey="name"
                            tick={{ fill:'#7a8ba0', fontSize:10 }}
                            tickLine={false}
                            interval={stackedXInterval}
                        />
                        <YAxis tick={{ fill:'#7a8ba0', fontSize:12 }} tickFormatter={v => v.toFixed(0) + '€'} width={52} />
                        <Tooltip
                            contentStyle={{ background:'#1a2233', border:'1px solid #222d3d', borderRadius:8 }}
                            labelStyle={{ color:'#c8d4e0' }}
                            content={({ active, payload, label: tipLabel }) => {
                                if (!active || !payload) return null
                                const filtered = payload.filter(p => p.value > 0)
                                if (!filtered.length) return null
                                return (
                                    <div style={{ background:'#1a2233', border:'1px solid #222d3d', borderRadius:8, padding:'10px 14px' }}>
                                        <p style={{ color:'#c8d4e0', marginBottom:6, fontWeight:600 }}>{tipLabel}</p>
                                        {filtered.map(p => (
                                            <p key={p.dataKey} style={{ color: p.fill, margin:'2px 0', fontSize:13 }}>
                                                {byHolding[p.dataKey]?.name || p.dataKey}: {(+p.value).toFixed(2)} € ({label})
                                            </p>
                                        ))}
                                    </div>
                                )
                            }}
                            cursor={{ fill:'rgba(255,255,255,0.04)' }}
                        />
                        <Legend
                            wrapperStyle={{ fontSize:11, maxHeight:60, overflowY:'auto' }}
                            formatter={isin => <span style={{ color:'#c8d4e0' }}>{byHolding[isin]?.name || isin}</span>}
                        />
                        {isins.map((isin, idx) => {
                            const color     = byHolding[isin]?.color || '#94a3b8'
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
                    </BarChart>

                ) : (
                    <LineChart data={cumLineData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a2233" />
                        <XAxis dataKey="name" tick={{ fill:'#7a8ba0', fontSize:12 }} />
                        <YAxis tick={{ fill:'#7a8ba0', fontSize:12 }} tickFormatter={v => v.toFixed(0) + '€'} width={52} />
                        <Tooltip
                            contentStyle={{ background:'#1a2233', border:'1px solid #222d3d', borderRadius:8 }}
                            labelStyle={{ color:'#c8d4e0' }}
                            formatter={(v, n) => {
                                if (n === 'inflation_target') return [`${(+v).toFixed(2)} € (Ziel)`, '📉 Inflation']
                                const lbl = n === `${cy}_real` ? `${cy}` : n.endsWith('_forecast') ? 'Prognose' : n
                                return [fmtTip(v), lbl]
                            }}
                            cursor={{ stroke:'#2a3a50', strokeWidth:1 }}
                        />
                        <Legend wrapperStyle={{ fontSize:13 }} formatter={renderLineLegend} />
                        {years.filter(y => y < cy).map(y => (
                            <Line key={y} type="monotone" dataKey={String(y)}
                                  stroke={YEAR_COLORS[y] || '#94a3b8'} strokeWidth={2}
                                  dot={{ r:2 }} activeDot={{ r:5 }} connectNulls
                            />
                        ))}
                        <Line type="monotone" dataKey={`${cy}_real`}
                              stroke={YEAR_COLORS[cy] || '#f472b6'} strokeWidth={2}
                              dot={{ r:2 }} activeDot={{ r:5 }} connectNulls
                        />
                        <Line type="monotone" dataKey={`${cy}_forecast`}
                              stroke={YEAR_COLORS[cy] || '#f472b6'} strokeWidth={2}
                              strokeDasharray="6 4" dot={false} connectNulls
                        />
                        <Line type="monotone" dataKey={`${ny}_forecast`}
                              stroke="#34d399" strokeWidth={2}
                              strokeDasharray="6 4" dot={false} connectNulls
                        />
                        {showInflation && (
                            <Line
                                type="monotone"
                                dataKey="inflation_target"
                                stroke="#f97316"
                                strokeWidth={1.5}
                                strokeDasharray="5 3"
                                dot={false}
                                connectNulls
                                name="inflation_target"
                            />
                        )}
                    </LineChart>
                )}
            </ResponsiveContainer>

            {mode === 'cumulative' && (
                <p style={{ color:'#4a6080', fontSize:11, marginTop:10 }}>
                    ⋯ Prognose = Ø Dividende pro Anteil × aktuelle Anteile · organisches DPS-Wachstum für {ny}
                    {showInflation && <span style={{ color:'#f97316' }}> · 📉 Orangene Linie = nötige Dividende um Kaufkraft seit {baseYear} zu erhalten (Destatis VPI)</span>}
                    {showGross && <span style={{ color:'#fb923c' }}> · Brutto basiert auf ø Steuerquote je Aktie</span>}
                </p>
            )}
            {mode === 'stacked' && (
                <p style={{ color:'#4a6080', fontSize:11, marginTop:10 }}>
                    ⋯ Halbtransparent = Prognose auf Basis Ø DPS der letzten 2 Jahre × aktuelle Anteile
                    {showGross && <span style={{ color:'#fb923c' }}> · Brutto: individuelle Steuerquote je Aktie</span>}
                </p>
            )}
            {mode === 'monthly' && showGross && (
                <p style={{ color:'#fb923c', fontSize:11, marginTop:10 }}>
                    ⚠️ Brutto-Hochrechnung basiert auf der ø Steuerquote aller Positionen ({(globalTaxRate * 100).toFixed(1)} %)
                </p>
            )}
        </div>
    )
}
