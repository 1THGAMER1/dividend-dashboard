import { useState } from 'react'

const fmt      = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtYield = n => n != null ? (+n).toFixed(2).replace('.', ',') + ' %' : '–'

const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

const typeLabel = (type, name = '') => {
    const n = (name || '').toUpperCase()
    if (n.endsWith('ETF') || n.includes('UCITS') || n.includes('INDEX FUND')) return 'ETF'
    if (type === 'crypto' || ['ADA','BTC','ETH','SOL','DOGE'].some(s => n.includes(s))) return 'Crypto'
    if (type === 'etf')      return 'ETF'
    if (type === 'security') return 'Aktie'
    if (type === 'fund')     return 'Fonds'
    return 'Aktie'
}

const typeColor = label => {
    if (label === 'ETF')    return { bg: '#1e3a5f', color: '#60a5fa' }
    if (label === 'Aktie')  return { bg: '#2e1b5e', color: '#a78bfa' }
    if (label === 'Crypto') return { bg: '#1e3a2e', color: '#34d399' }
    return                         { bg: '#2e2a1b', color: '#facc15' }
}

const YEAR_COLORS = ['#009991','#3b82f6','#a78bfa','#f472b6','#fb923c','#facc15']

function DividendHistoryPanel({ holding }) {
    const { monthly, gross, name } = holding
    if (!monthly || Object.keys(monthly).length === 0) {
        return <div style={{ color:'#556070', fontSize:13, padding:'16px 0' }}>Keine Verlaufsdaten vorhanden.</div>
    }

    const years = Object.keys(monthly).map(Number).sort((a, b) => a - b)
    const currentYear = new Date().getFullYear()

    // Für jedes Jahr: Netto pro Monat
    const yearData = years.map((y, idx) => ({
        year: y,
        color: YEAR_COLORS[idx % YEAR_COLORS.length],
        months: Array.from({ length: 12 }, (_, m) => monthly[y]?.[m] ?? 0),
    }))

    const allValues = yearData.flatMap(yd => yd.months)
    const maxVal    = Math.max(...allValues, 0.01)
    const totalNet  = allValues.reduce((s, v) => s + v, 0)

    // Jahreszusammenfassung
    const yearSums = yearData.map(yd => ({
        year:  yd.year,
        color: yd.color,
        net:   yd.months.reduce((s, v) => s + v, 0),
    }))

    const CHART_H = 120

    return (
        <div style={{ padding:'20px 10px 10px', display:'flex', flexDirection:'column', gap:20 }}>

            {/* Monatlicher Verlauf */}
            <div>
                <div style={{ fontSize:12, color:'#556070', marginBottom:12, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                    Monatlicher Dividendenverlauf
                </div>

                {/* Legende */}
                <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:12 }}>
                    {yearData.map(yd => (
                        <div key={yd.year} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                            <div style={{ width:10, height:10, borderRadius:2, background: yd.color }} />
                            <span style={{ color: yd.year === currentYear ? '#e0e6f0' : '#7a8ba0', fontWeight: yd.year === currentYear ? 600 : 400 }}>
                                {yd.year}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Chart: gruppierte Balken pro Monat */}
                <div style={{ display:'flex', alignItems:'flex-end', gap:4 }}>
                    {MONTHS_SHORT.map((mon, mIdx) => {
                        const hasAny = yearData.some(yd => yd.months[mIdx] > 0)
                        return (
                            <div key={mon} style={{ flex:'1 0 auto', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                                {/* Balken */}
                                <div style={{ display:'flex', alignItems:'flex-end', gap:1, height:CHART_H }}>
                                    {yearData.map(yd => {
                                        const val = yd.months[mIdx]
                                        const h   = Math.max(val > 0 ? 3 : 0, (val / maxVal) * CHART_H)
                                        return (
                                            <div
                                                key={yd.year}
                                                title={`${mon} ${yd.year}: ${fmt(val)}`}
                                                style={{
                                                    width:         Math.max(6, Math.floor(24 / yearData.length)),
                                                    height:        h,
                                                    borderRadius:  '3px 3px 0 0',
                                                    background:    val > 0 ? yd.color : 'transparent',
                                                    opacity:       yd.year === currentYear ? 1 : 0.65,
                                                    transition:    'opacity 0.2s',
                                                    cursor:        val > 0 ? 'default' : 'default',
                                                    alignSelf:     'flex-end',
                                                }}
                                            />
                                        )
                                    })}
                                </div>
                                {/* Monats-Label */}
                                <span style={{ fontSize:9, color: hasAny ? '#556070' : '#2a3a50', marginTop:4 }}>{mon}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Jahreszusammenfassung */}
            <div>
                <div style={{ fontSize:12, color:'#556070', marginBottom:10, letterSpacing:'0.05em', textTransform:'uppercase' }}>
                    Jährliche Summe
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {yearSums.map(ys => (
                        <div key={ys.year} style={{
                            background:   '#0f1420',
                            border:       `1px solid ${ys.year === currentYear ? ys.color + '60' : '#1e2a3a'}`,
                            borderRadius: 8,
                            padding:      '8px 14px',
                            minWidth:     80,
                        }}>
                            <div style={{ fontSize:11, color: ys.year === currentYear ? ys.color : '#3d5266', marginBottom:3, fontWeight: ys.year === currentYear ? 600 : 400 }}>
                                {ys.year}
                            </div>
                            <div style={{ fontSize:14, fontWeight:700, color: ys.net > 0 ? '#c8d4e0' : '#3d5266' }}>
                                {ys.net > 0 ? fmt(ys.net) : '–'}
                            </div>
                            {ys.net > 0 && (
                                <div style={{ fontSize:10, color:'#3d5266', marginTop:2 }}>
                                    ≈ {fmt(ys.net / 12)} / Mo
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default function PositionsTable({ byHolding = {}, kpiRange = 'all' }) {
    const now = new Date()
    const [expandedRow, setExpandedRow] = useState(null)

    const positions = Object.entries(byHolding).map(([isin, h]) => {
        let net = 0, gross = 0, tax = 0

        for (const [year, months] of Object.entries(h.monthly || {})) {
            for (let m = 0; m < 12; m++) {
                const date = new Date(+year, m, 1)
                const diff = (now - date) / 864e5
                if (kpiRange === 'ytd' && date.getFullYear() !== now.getFullYear()) continue
                if (kpiRange === '12m' && diff > 365) continue
                net   += months[m]            || 0
                gross += h.gross?.[year]?.[m] || 0
                tax   += h.tax?.[year]?.[m]   || 0
            }
        }

        tax = gross - net

        return {
            isin,
            holding:    h,
            name:       h.name       || isin,
            type:       h.type       || 'security',
            ticker:     h.ticker     || null,
            yield:      h.yield      ?? null,
            assetYield: h.assetYield ?? null,
            net, gross, tax,
        }
    })
        .filter(p => p.net > 0)
        .sort((a, b) => b.net - a.net)

    const COLS = 6

    return (
        <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:16 }}>Dividenden nach Positionen</h2>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                <tr>
                    {['Holding','Typ','Pers. Rendite','Div. Yield','Netto','Brutto'].map((h, i) => (
                        <th key={h} style={{
                            color:'#7a8ba0', fontWeight:500, padding:'6px 10px',
                            borderBottom:'1px solid #222d3d', fontSize:12,
                            textAlign: i < 2 ? 'left' : 'right'
                        }}>{h}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {positions.map(p => {
                    const label    = typeLabel(p.type, p.name)
                    const { bg, color } = typeColor(label)
                    const isOpen   = expandedRow === p.isin
                    const toggle   = () => setExpandedRow(isOpen ? null : p.isin)

                    return (
                        <>
                            {/* Hauptzeile */}
                            <tr
                                key={p.isin}
                                onClick={toggle}
                                style={{
                                    cursor:     'pointer',
                                    background: isOpen ? '#1a2540' : 'transparent',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#111827' }}
                                onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                            >
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        {/* Expand-Pfeil */}
                                        <span style={{
                                            fontSize:     10,
                                            color:        '#3d5266',
                                            transform:    isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                            transition:   'transform 0.2s',
                                            display:      'inline-block',
                                            lineHeight:   1,
                                            userSelect:   'none',
                                        }}>▶</span>
                                        {p.ticker
                                            ? <a
                                                href={`https://etfchecker.netlify.app/?ticker=${p.ticker}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color:'#60a5fa', textDecoration:'none' }}
                                                onClick={e => e.stopPropagation()}
                                                onMouseOver={e => e.currentTarget.style.textDecoration='underline'}
                                                onMouseOut={e  => e.currentTarget.style.textDecoration='none'}
                                            >
                                                {p.name}
                                            </a>
                                            : <span style={{ color:'#c8d4e0' }}>{p.name}</span>
                                        }
                                    </div>
                                </td>
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233' }}>
                                    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, background:bg, color }}>
                                        {label}
                                    </span>
                                </td>
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color: p.yield != null ? '#facc15' : '#7a8ba0', fontWeight:600 }}>
                                    {fmtYield(p.yield)}
                                </td>
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color: p.assetYield != null ? '#38bdf8' : '#7a8ba0', fontWeight:600 }}>
                                    {fmtYield(p.assetYield)}
                                </td>
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color:'#22c55e', fontWeight:600 }}>
                                    {fmt(p.net)}
                                </td>
                                <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right' }}>
                                    <div>{fmt(p.gross)}</div>
                                    <div style={{ fontSize:11, color:'#fb923c', marginTop:2 }}>-{fmt(p.tax)} Steuern</div>
                                </td>
                            </tr>

                            {/* Expanded Detail-Panel */}
                            {isOpen && (
                                <tr key={p.isin + '_detail'}>
                                    <td colSpan={COLS} style={{
                                        padding:      '0 10px 16px',
                                        borderBottom: '1px solid #222d3d',
                                        background:   '#1a2540',
                                    }}>
                                        <DividendHistoryPanel holding={p.holding} />
                                    </td>
                                </tr>
                            )}
                        </>
                    )
                })}
                </tbody>
            </table>
        </div>
    )
}
