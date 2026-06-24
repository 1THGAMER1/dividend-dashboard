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
const CHART_H = 100

// Chart-Wrapper für Akkumuliert + Performance (SVG-basiert)
function ChartBox({ children }) {
    return (
        <div style={{
            background: '#131c2e',
            border: '1px solid #1e2a3a',
            borderRadius: 10,
            padding: '14px 16px 10px',
            minWidth: 320,
        }}>
            {children}
        </div>
    )
}

function DividendHistoryPanel({ holding }) {
    const { monthly } = holding
    const [mode, setMode] = useState('monthly')

    if (!monthly || Object.keys(monthly).length === 0) {
        return <div style={{ color:'#556070', fontSize:13, padding:'16px 0' }}>Keine Verlaufsdaten vorhanden.</div>
    }

    const years = Object.keys(monthly).map(Number).sort((a, b) => a - b)
    const currentYear = new Date().getFullYear()

    const yearData = years.map((y, idx) => ({
        year: y,
        color: YEAR_COLORS[idx % YEAR_COLORS.length],
        months: Array.from({ length: 12 }, (_, m) => monthly[y]?.[m] ?? 0),
    }))

    const yearDataCum = yearData.map(yd => {
        let running = 0
        return { ...yd, months: yd.months.map(v => { running += v; return running }) }
    })

    const allTimePoints = []
    let runningTotal = 0
    years.forEach(y => {
        Array.from({ length: 12 }, (_, m) => monthly[y]?.[m] ?? 0).forEach((v, m) => {
            runningTotal += v
            allTimePoints.push({ year: y, month: m, value: runningTotal, raw: v })
        })
    })
    const lastPayIdx = allTimePoints.reduce((last, pt, i) => pt.raw > 0 ? i : last, -1)
    const perfPoints = lastPayIdx >= 0 ? allTimePoints.slice(0, lastPayIdx + 1) : allTimePoints

    const maxVal = mode === 'cumulative'
        ? Math.max(...yearDataCum.flatMap(yd => yd.months), 0.01)
        : mode === 'performance'
        ? Math.max(...perfPoints.map(p => p.value), 0.01)
        : Math.max(...yearData.flatMap(yd => yd.months), 0.01)

    const yearSums = yearData.map(yd => ({
        year:  yd.year,
        color: yd.color,
        net:   yd.months.reduce((s, v) => s + v, 0),
    }))

    // SVG-Dimensionen für Akkumuliert + Performance
    const VW = 520, VH = 160
    const PL = 8, PR = 8, PT = 10, PB = 22
    const CW = VW - PL - PR
    const CH = VH - PT - PB

    const cumX = i => PL + (i / 11) * CW
    const cumY = v => PT + CH - (v / maxVal) * CH

    const n = perfPoints.length
    const perfX = i => PL + (i / Math.max(n - 1, 1)) * CW
    const perfY = v => PT + CH - (v / maxVal) * CH
    const linePoints = perfPoints.map((p, i) => `${perfX(i)},${perfY(p.value)}`).join(' ')
    const yearBoundaries = []
    years.forEach(y => {
        const firstIdx = perfPoints.findIndex(p => p.year === y)
        if (firstIdx > 0) yearBoundaries.push({ x: perfX(firstIdx), year: y })
    })

    return (
        <div style={{ padding:'16px 4px 8px', display:'flex', flexDirection:'column', gap:14 }}>

            {/* Legende + Toggle */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                {mode !== 'performance' ? (
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                        {yearData.map(yd => (
                            <div key={yd.year} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                                <div style={{ width:10, height:10, borderRadius:2, background: yd.color }} />
                                <span style={{ color: yd.year === currentYear ? '#e0e6f0' : '#7a8ba0', fontWeight: yd.year === currentYear ? 600 : 400 }}>{yd.year}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:12, height:3, borderRadius:2, background:'#22c55e' }} />
                        <span style={{ fontSize:11, color:'#7a8ba0' }}>Gesamtperformance seit {years[0]}</span>
                    </div>
                )}
                <div style={{ display:'flex', background:'#0f1420', borderRadius:20, padding:2, border:'1px solid #1e2a3a', gap:2 }}>
                    {[['monthly','Monatlich'],['cumulative','Akkumuliert'],['performance','Performance']].map(([val, label]) => (
                        <button key={val} onClick={() => setMode(val)} style={{
                            background: mode === val ? (val === 'performance' ? '#1a3a1a' : '#1e3a5f') : 'transparent',
                            border: 'none',
                            color: mode === val ? (val === 'performance' ? '#4ade80' : '#93c5fd') : '#556070',
                            borderRadius: 16, padding: '3px 10px',
                            fontSize: 11, cursor: 'pointer',
                            fontWeight: mode === val ? 600 : 400,
                            transition: 'all 0.15s',
                        }}>{label}</button>
                    ))}
                </div>
            </div>

            <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>

                {/* ===== Chart 1: Monatlich — ORIGINAL, unverändert ===== */}
                {mode === 'monthly' && (
                    <div style={{ display:'flex', alignItems:'flex-end', gap:3, minWidth:320 }}>
                        {MONTHS_SHORT.map((mon, mIdx) => {
                            const hasAny = yearData.some(yd => yd.months[mIdx] > 0)
                            return (
                                <div key={mon} style={{ flex:'1 0 auto', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                                    <div style={{ display:'flex', alignItems:'flex-end', gap:1, height:CHART_H }}>
                                        {yearData.map(yd => {
                                            const val = yd.months[mIdx]
                                            const h   = Math.max(val > 0 ? 3 : 0, (val / maxVal) * CHART_H)
                                            return (
                                                <div key={yd.year} title={`${mon} ${yd.year}: ${fmt(val)}`} style={{
                                                    width: Math.max(6, Math.floor(24 / yearData.length)),
                                                    height: h, borderRadius:'3px 3px 0 0',
                                                    background: val > 0 ? yd.color : 'transparent',
                                                    opacity: yd.year === currentYear ? 1 : 0.65,
                                                    alignSelf: 'flex-end',
                                                }} />
                                            )
                                        })}
                                    </div>
                                    <span style={{ fontSize:9, color: hasAny ? '#556070' : '#2a3a50', marginTop:3 }}>{mon}</span>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* ===== Chart 2: Akkumuliert — in ChartBox, gleiche Größe wie Monatlich-Container ===== */}
                {mode === 'cumulative' && (
                    <ChartBox>
                        <svg
                            width="100%"
                            viewBox={`0 0 ${VW} ${VH}`}
                            preserveAspectRatio="xMidYMid meet"
                            style={{ display:'block' }}
                        >
                            <defs>
                                {yearDataCum.map(yd => (
                                    <linearGradient key={yd.year} id={`cumGrad${yd.year}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={yd.color} stopOpacity={yd.year === currentYear ? 0.18 : 0.06} />
                                        <stop offset="100%" stopColor={yd.color} stopOpacity="0" />
                                    </linearGradient>
                                ))}
                            </defs>
                            {[0.25, 0.5, 0.75, 1].map(f => (
                                <line key={f} x1={PL} y1={PT + CH - f * CH} x2={VW - PR} y2={PT + CH - f * CH} stroke="#1e2a3a" strokeWidth="1" />
                            ))}
                            {yearDataCum.map(yd => {
                                const pts = yd.months.map((v, i) => `${cumX(i)},${cumY(v)}`).join(' ')
                                const area = `${cumX(0)},${PT + CH} ${pts} ${cumX(11)},${PT + CH}`
                                return (
                                    <g key={yd.year}>
                                        <polygon points={area} fill={`url(#cumGrad${yd.year})`} />
                                        <polyline points={pts} fill="none" stroke={yd.color}
                                            strokeWidth={yd.year === currentYear ? 2 : 1.5}
                                            strokeLinejoin="round" strokeLinecap="round"
                                            opacity={yd.year === currentYear ? 1 : 0.55}
                                        />
                                        {yd.months.map((v, i) => v === 0 ? null : (
                                            <circle key={i} cx={cumX(i)} cy={cumY(v)}
                                                r={yd.year === currentYear ? 2.5 : 2}
                                                fill={yd.color} stroke="#131c2e" strokeWidth="1.5"
                                                opacity={yd.year === currentYear ? 1 : 0.55}
                                            >
                                                <title>{MONTHS_SHORT[i]} {yd.year}: {fmt(v)} kum.</title>
                                            </circle>
                                        ))}
                                    </g>
                                )
                            })}
                            {MONTHS_SHORT.map((mon, i) => (
                                <text key={mon} x={cumX(i)} y={VH - 4} textAnchor="middle" fontSize="9" fill="#3d5266">{mon}</text>
                            ))}
                        </svg>
                    </ChartBox>
                )}

                {/* ===== Chart 3: Performance — in ChartBox, gleiche Größe wie Monatlich-Container ===== */}
                {mode === 'performance' && (
                    <ChartBox>
                        <svg
                            width="100%"
                            viewBox={`0 0 ${VW} ${VH}`}
                            preserveAspectRatio="xMidYMid meet"
                            style={{ display:'block' }}
                        >
                            <defs>
                                <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {[0.25, 0.5, 0.75, 1].map(f => (
                                <line key={f} x1={PL} y1={PT + CH - f * CH} x2={VW - PR} y2={PT + CH - f * CH} stroke="#1e2a3a" strokeWidth="1" />
                            ))}
                            {yearBoundaries.map(({ x, year }) => (
                                <g key={year}>
                                    <line x1={x} y1={PT} x2={x} y2={PT + CH} stroke="#2a3a50" strokeWidth="1" strokeDasharray="4 4" />
                                    <text x={x + 4} y={PT + 11} fontSize="9" fill="#3d5266">{year}</text>
                                </g>
                            ))}
                            {perfPoints.length > 1 && (
                                <polygon
                                    points={[
                                        `${perfX(0)},${PT + CH}`,
                                        ...perfPoints.map((_, i) => `${perfX(i)},${perfY(perfPoints[i].value)}`),
                                        `${perfX(n - 1)},${PT + CH}`,
                                    ].join(' ')}
                                    fill="url(#perfGrad)"
                                />
                            )}
                            {perfPoints.length > 1 && (
                                <polyline points={linePoints} fill="none" stroke="#22c55e"
                                    strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                            )}
                            {perfPoints.map((p, i) => p.raw === 0 ? null : (
                                <circle key={i} cx={perfX(i)} cy={perfY(p.value)} r="2.5"
                                    fill="#22c55e" stroke="#131c2e" strokeWidth="1.5">
                                    <title>{MONTHS_SHORT[p.month]} {p.year}: +{fmt(p.raw)} → {fmt(p.value)} gesamt</title>
                                </circle>
                            ))}
                            {perfPoints.length > 0 && (() => {
                                const last = perfPoints[perfPoints.length - 1]
                                const x = perfX(n - 1)
                                const y = perfY(last.value)
                                const labelW = 58
                                const lx = Math.min(x, VW - PR - labelW / 2)
                                return (
                                    <g>
                                        <rect x={lx - labelW / 2} y={y - 18} width={labelW} height={15} rx="4"
                                            fill="#1a3a1a" stroke="#22c55e" strokeWidth="0.75" />
                                        <text x={lx} y={y - 7} textAnchor="middle" fontSize="9"
                                            fill="#4ade80" fontWeight="bold">{fmt(last.value)}</text>
                                    </g>
                                )
                            })()}
                            <text x={perfX(0)} y={VH - 4} textAnchor="middle" fontSize="9" fill="#3d5266">{years[0]}</text>
                        </svg>
                    </ChartBox>
                )}
            </div>

            {/* Jahres-Summen-Cards */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {yearSums.map(ys => (
                    <div key={ys.year} style={{
                        background:'#0f1420', border:`1px solid ${ys.year === currentYear ? ys.color + '60' : '#1e2a3a'}`,
                        borderRadius:8, padding:'8px 12px', minWidth:68,
                    }}>
                        <div style={{ fontSize:11, color: ys.year === currentYear ? ys.color : '#3d5266', marginBottom:3, fontWeight: ys.year === currentYear ? 600 : 400 }}>{ys.year}</div>
                        <div style={{ fontSize:13, fontWeight:700, color: ys.net > 0 ? '#c8d4e0' : '#3d5266' }}>{ys.net > 0 ? fmt(ys.net) : '–'}</div>
                        {ys.net > 0 && <div style={{ fontSize:10, color:'#3d5266', marginTop:2 }}>≈ {fmt(ys.net / 12)} / Mo</div>}
                    </div>
                ))}
                {mode === 'performance' && (() => {
                    const total = yearSums.reduce((s, ys) => s + ys.net, 0)
                    return total > 0 ? (
                        <div style={{
                            background:'#0f1420', border:'1px solid #22c55e40',
                            borderRadius:8, padding:'8px 12px', minWidth:68,
                        }}>
                            <div style={{ fontSize:11, color:'#22c55e', marginBottom:3, fontWeight:600 }}>Gesamt</div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#4ade80' }}>{fmt(total)}</div>
                        </div>
                    ) : null
                })()}
            </div>
        </div>
    )
}

function PositionCard({ p, isOpen, onToggle }) {
    const label = typeLabel(p.type, p.name)
    const { bg, color } = typeColor(label)
    return (
        <div style={{ background: isOpen ? '#1a2540' : '#161b27', border:'1px solid #222d3d', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
            <div onClick={onToggle} style={{ padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:10, color:'#3d5266', transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.2s', display:'inline-block', userSelect:'none', flexShrink:0 }}>▶</span>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:'#c8d4e0', fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {p.ticker
                            ? <a href={`https://etfchecker.netlify.app/?ticker=${p.ticker}`} target="_blank" rel="noopener noreferrer" style={{ color:'#60a5fa', textDecoration:'none' }} onClick={e => e.stopPropagation()}>{p.name}</a>
                            : p.name
                        }
                    </div>
                    <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
                        <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:10, fontSize:10, background:bg, color }}>{label}</span>
                        {p.yield != null && <span style={{ fontSize:11, color:'#facc15' }}>Pers. {fmtYield(p.yield)}</span>}
                        {p.assetYield != null && <span style={{ fontSize:11, color:'#38bdf8' }}>Yield {fmtYield(p.assetYield)}</span>}
                    </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ color:'#22c55e', fontWeight:700, fontSize:14 }}>{fmt(p.net)}</div>
                    <div style={{ fontSize:11, color:'#7a8ba0', marginTop:2 }}>{fmt(p.gross)}</div>
                    {p.tax > 0 && <div style={{ fontSize:10, color:'#fb923c' }}>-{fmt(p.tax)}</div>}
                </div>
            </div>
            {isOpen && (
                <div style={{ borderTop:'1px solid #222d3d', background:'#1a2540', padding:'0 6px 12px' }}>
                    <DividendHistoryPanel holding={p.holding} />
                </div>
            )}
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
        return { isin, holding:h, name:h.name||isin, type:h.type||'security', ticker:h.ticker||null, yield:h.yield??null, assetYield:h.assetYield??null, net, gross, tax }
    })
        .filter(p => p.net > 0)
        .sort((a, b) => b.net - a.net)

    const toggle = isin => setExpandedRow(prev => prev === isin ? null : isin)

    return (
        <div style={{ marginBottom:20 }}>
            <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:14 }}>Dividenden nach Positionen</h2>

            <div className="positions-mobile">
                {positions.map(p => (
                    <PositionCard key={p.isin} p={p} isOpen={expandedRow === p.isin} onToggle={() => toggle(p.isin)} />
                ))}
            </div>

            <div className="positions-desktop" style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                    <tr>
                        {['Holding','Typ','Pers. Rendite','Div. Yield','Netto','Brutto'].map((h, i) => (
                            <th key={h} style={{ color:'#7a8ba0', fontWeight:500, padding:'6px 10px', borderBottom:'1px solid #222d3d', fontSize:12, textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {positions.map(p => {
                        const label = typeLabel(p.type, p.name)
                        const { bg, color } = typeColor(label)
                        const isOpen = expandedRow === p.isin
                        return (
                            <>
                                <tr key={p.isin} onClick={() => toggle(p.isin)}
                                    style={{ cursor:'pointer', background: isOpen ? '#1a2540' : 'transparent', transition:'background 0.15s' }}
                                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = '#111827' }}
                                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}
                                >
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                            <span style={{ fontSize:10, color:'#3d5266', transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.2s', display:'inline-block', userSelect:'none' }}>▶</span>
                                            {p.ticker
                                                ? <a href={`https://etfchecker.netlify.app/?ticker=${p.ticker}`} target="_blank" rel="noopener noreferrer" style={{ color:'#60a5fa', textDecoration:'none' }} onClick={e => e.stopPropagation()} onMouseOver={e => e.currentTarget.style.textDecoration='underline'} onMouseOut={e => e.currentTarget.style.textDecoration='none'}>{p.name}</a>
                                                : <span style={{ color:'#c8d4e0' }}>{p.name}</span>
                                            }
                                        </div>
                                    </td>
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233' }}>
                                        <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, background:bg, color }}>{label}</span>
                                    </td>
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color: p.yield != null ? '#facc15' : '#7a8ba0', fontWeight:600 }}>{fmtYield(p.yield)}</td>
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color: p.assetYield != null ? '#38bdf8' : '#7a8ba0', fontWeight:600 }}>{fmtYield(p.assetYield)}</td>
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right', color:'#22c55e', fontWeight:600 }}>{fmt(p.net)}</td>
                                    <td style={{ padding:'8px 10px', borderBottom: isOpen ? 'none' : '1px solid #1a2233', textAlign:'right' }}>
                                        <div>{fmt(p.gross)}</div>
                                        <div style={{ fontSize:11, color:'#fb923c', marginTop:2 }}>-{fmt(p.tax)} Steuern</div>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr key={p.isin + '_detail'}>
                                        <td colSpan={6} style={{ padding:'0 10px 16px', borderBottom:'1px solid #222d3d', background:'#1a2540' }}>
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
        </div>
    )
}
