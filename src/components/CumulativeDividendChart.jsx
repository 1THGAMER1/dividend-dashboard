import { useState, useMemo } from 'react'
import {
    LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
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

function forwardFill(arr) {
    let last = null
    return arr.map(v => {
        if (v !== null && v !== undefined) { last = v; return v }
        return last
    })
}

export default function CumulativeDividendChart({ monthly, cum, forecastCum, byHolding }) {
    const [showGross, setShowGross] = useState(false)

    const cy = new Date().getFullYear()
    const ny = cy + 1
    const cm = new Date().getMonth()
    const years = Object.keys(monthly || {}).map(Number).sort()

    const fcCy = forecastCum?.[cy] || Array(12).fill(null)
    const fcNy = forecastCum?.[ny] || Array(12).fill(null)

    const globalTaxRate = useMemo(() => {
        let totalNet = 0, totalGross = 0
        for (const h of Object.values(byHolding || {})) {
            for (const year of Object.values(h.monthly || {})) for (const v of year) totalNet   += v || 0
            for (const year of Object.values(h.gross  || {})) for (const v of year) totalGross += v || 0
        }
        if (totalGross <= 0 || totalNet <= 0) return 0
        return Math.max(0, Math.min(1, 1 - totalNet / totalGross))
    }, [byHolding])

    const scaleNet = (v) => showGross ? toGross(v, globalTaxRate) : v

    const cumLineDataRaw = MONTHS.map((name, i) => {
        const pt = { name }
        years.filter(y => y < cy).forEach(y => {
            pt[String(y)] = +scaleNet(cum[y]?.[i] || 0).toFixed(2)
        })
        pt[`${cy}_real`]     = i <= cm - 1 ? +scaleNet(fcCy[i] ?? 0).toFixed(2) : null
        pt[`${cy}_forecast`] = i >= cm - 1 ? +scaleNet(fcCy[i] ?? 0).toFixed(2) : null
        pt[`${ny}_forecast`] = fcNy[i] != null ? +scaleNet(fcNy[i]).toFixed(2) : null
        return pt
    })

    const cumLineData = (() => {
        const fillKeys = [
            ...years.filter(y => y < cy).map(String),
            `${cy}_forecast`,
            `${ny}_forecast`,
        ]
        const noFillKeys = [`${cy}_real`]
        const filled = fillKeys.reduce((acc, key) => {
            acc[key] = forwardFill(cumLineDataRaw.map(pt => pt[key] ?? null))
            return acc
        }, {})
        return cumLineDataRaw.map((pt, i) => {
            const newPt = { name: pt.name }
            fillKeys.forEach(key => { newPt[key] = filled[key][i] })
            noFillKeys.forEach(key => { newPt[key] = pt[key] ?? null })
            return newPt
        })
    })()

    const label = showGross ? 'Brutto' : 'Netto'
    const fmtTip = v => `${(+v).toFixed(2)} € (${label})`

    const renderLineLegend = value => {
        const color = value === `${cy}_real`     ? YEAR_COLORS[cy] || '#c0397a'
            : value === `${cy}_forecast` ? YEAR_COLORS[cy] || '#c0397a'
                : value === `${ny}_forecast` ? '#34d399'
                    : YEAR_COLORS[+value]        || '#94a3b8'
        const lbl = value === `${cy}_real`     ? String(cy)
            : value === `${cy}_forecast` ? `${cy} Prognose`
                : value === `${ny}_forecast` ? `${ny} Prognose`
                    : value
        return <span style={{ color }}>{lbl}</span>
    }

    const pillBase   = { padding:'5px 12px', borderRadius:20, fontSize:12, cursor:'pointer', border:'1px solid #2a3a50', background:'transparent', color:'#7a8ba0', fontWeight:600 }
    const pillActive = { ...pillBase, background:'#1e3a5f', color:'#93c5fd' }
    const grossActive= { ...pillBase, background:'rgba(251,146,60,0.12)', border:'1px solid #fb923c', color:'#fb923c' }

    return (
        <div style={{ background:'#161b27', borderRadius:16, padding:20, border:'1px solid #1e2a3a' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                <div>
                    <h3 style={{ fontSize:16, fontWeight:600, color:'#f1f5f9', margin:0 }}>
                        📈 Akkumulierter Jahresverlauf
                    </h3>
                    <p style={{ color:'#64748b', fontSize:12, margin:'2px 0 0 0' }}>
                        Summe der Ausschüttungen von Januar bis Dezember im Mehrjahresvergleich
                    </p>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:3, padding:'2px', background:'#0f1420', borderRadius:22, border:'1px solid #1e2a3a' }}>
                        <button onClick={() => setShowGross(false)} style={!showGross ? pillActive : pillBase}>Netto</button>
                        <button onClick={() => setShowGross(true)}  style={ showGross ? grossActive : pillBase}>Brutto</button>
                    </div>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={290}>
                <LineChart data={cumLineData} margin={{ top:8, right:16, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill:'#7a8ba0', fontSize:11 }} tickLine={false} axisLine={{ stroke:'#1e2a3a' }} />
                    <YAxis tick={{ fill:'#7a8ba0', fontSize:11 }} tickFormatter={v => v.toFixed(0) + '€'} width={48} axisLine={false} tickLine={false} />
                    <Tooltip
                        contentStyle={{ background:'#161b27', border:'1px solid #2a3a50', borderRadius:8, fontSize:12 }}
                        labelStyle={{ color:'#f1f5f9', fontWeight:600 }}
                        formatter={(v, n) => {
                            const lbl = n === `${cy}_real` ? `${cy}` : n.endsWith('_forecast') ? `${n.split('_')[0]} Prognose` : n
                            return [fmtTip(v), lbl]
                        }}
                        cursor={{ stroke:'#2a3a50', strokeWidth:1 }}
                    />
                    <Legend wrapperStyle={{ fontSize:12, paddingTop:8 }} formatter={renderLineLegend} />
                    {years.filter(y => y < cy).map(y => (
                        <Line key={y} type="monotone" dataKey={String(y)}
                              stroke={YEAR_COLORS[y] || '#94a3b8'} strokeWidth={2}
                              dot={{ r:2 }} activeDot={{ r:4 }}
                        />
                    ))}
                    <Line type="monotone" dataKey={`${cy}_real`}
                          stroke={YEAR_COLORS[cy] || '#c0397a'} strokeWidth={2.5}
                          dot={{ r:3 }} activeDot={{ r:5 }}
                          connectNulls={false}
                    />
                    <Line type="monotone" dataKey={`${cy}_forecast`}
                          stroke={YEAR_COLORS[cy] || '#c0397a'} strokeWidth={2}
                          strokeDasharray="5 4" dot={false}
                    />
                    <Line type="monotone" dataKey={`${ny}_forecast`}
                          stroke="#34d399" strokeWidth={2}
                          strokeDasharray="5 4" dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>

            <p style={{ color:'#64748b', fontSize:11, marginTop:8, marginBottom:0 }}>
                ⋯ Gestrichelt = Prognose basierend auf aktuellen Anteilen & Vorjahresausschüttungen
            </p>
        </div>
    )
}