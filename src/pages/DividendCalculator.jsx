import { useState, useMemo } from 'react'

const CURRENCY_FMT = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Slider({ label, min, max, step, value, onChange, unit, color = '#009991' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#7a8ba0' }}>{label}</span>
                <span style={{ color: '#e0e6f0', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8 }}>{value}{unit}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{ accentColor: color, width: '100%', cursor: 'pointer', height: 4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#3d5266' }}>
                <span>{min}{unit}</span><span>{max}{unit}</span>
            </div>
        </div>
    )
}

function ResultCard({ label, value, sub, accent = false }) {
    return (
        <div style={{
            background:   accent ? 'linear-gradient(135deg, #003d3a 0%, #001a18 100%)' : '#161b27',
            border:       `1px solid ${accent ? '#009991' : '#1e2a3a'}`,
            borderRadius: 12,
            padding:      '14px 16px',
            minWidth:     0,
        }}>
            <div style={{ fontSize: 12, color: '#556070', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: accent ? 22 : 18, fontWeight: 700, color: accent ? '#5bcec2' : '#e0e6f0', wordBreak: 'break-word' }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: 11, color: '#3d5266', marginTop: 4 }}>{sub}</div>}
        </div>
    )
}

function yearsToGoalByGrowth(currentNet, targetNet, growthRate) {
    if (growthRate <= 0 || currentNet <= 0) return null
    let d = currentNet
    for (let y = 1; y <= 50; y++) {
        d *= 1 + growthRate / 100
        if (d >= targetNet) return y
    }
    return null
}

function GrowthTable({ currentDividends, targetNet, growthRate, yearsToGoal }) {
    const rows = useMemo(() => {
        const out = []
        let d = currentDividends
        const maxYears = yearsToGoal ? Math.min(yearsToGoal + 2, 50) : 20
        for (let y = 1; y <= maxYears; y++) {
            d *= 1 + growthRate / 100
            out.push({ year: new Date().getFullYear() + y, netto: d, reached: d >= targetNet })
        }
        return out
    }, [currentDividends, targetNet, growthRate, yearsToGoal])

    return (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 320 }}>
                <thead>
                <tr style={{ borderBottom: '1px solid #1e2a3a' }}>
                    {['Jahr', 'Netto/ Jahr', 'Netto/ Monat', 'Ziel'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#556070', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {rows.map(r => (
                    <tr key={r.year} style={{
                        borderBottom: '1px solid #111827',
                        background:   r.reached ? 'rgba(0,153,145,0.07)' : 'transparent',
                    }}>
                        <td style={{ padding: '7px 10px', color: '#7a8ba0', whiteSpace: 'nowrap' }}>{r.year}</td>
                        <td style={{ padding: '7px 10px', color: '#c8d4e0', whiteSpace: 'nowrap' }}>€{CURRENCY_FMT(r.netto)}</td>
                        <td style={{ padding: '7px 10px', color: '#c8d4e0', whiteSpace: 'nowrap' }}>€{CURRENCY_FMT(r.netto / 12)}</td>
                        <td style={{ padding: '7px 10px' }}>
                            {r.reached
                                ? <span style={{ color: '#5bcec2', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Erreicht</span>
                                : <span style={{ color: '#3d5266' }}>–</span>}
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    )
}

// Hoehe der Balken-Zone in px (feste Konstante = korrekte Offset-Berechnung)
const BAR_H = 160

function GrowthChart({ currentDividends, targetNet, growthRate, yearsToGoal }) {
    const rows = useMemo(() => {
        const out = []
        let d = currentDividends
        const maxYears = yearsToGoal ? Math.min(yearsToGoal + 2, 50) : 20
        for (let y = 1; y <= maxYears; y++) {
            d *= 1 + growthRate / 100
            out.push({ year: new Date().getFullYear() + y, netto: d })
        }
        return out
    }, [currentDividends, targetNet, growthRate, yearsToGoal])

    const maxVal = Math.max(...rows.map(r => r.netto), targetNet)
    // Ziellinie: x% von unten innerhalb des BAR_H-Containers
    const goalPx = Math.round((targetNet / maxVal) * BAR_H)

    return (
        <div style={{ marginTop: 8 }}>
            {/* Bar-Container mit position:relative — Ziellinie ist darin absolut */}
            <div style={{ position: 'relative', height: BAR_H, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>

                {/* Ziellinie */}
                <div style={{
                    position:      'absolute',
                    left:          0,
                    right:         0,
                    bottom:        goalPx,
                    borderTop:     '1px dashed #009991',
                    zIndex:        3,
                    pointerEvents: 'none',
                }}>
                    <span style={{
                        position:     'absolute',
                        left:         0,
                        top:          -16,
                        fontSize:     10,
                        color:        '#009991',
                        background:   '#161b27',
                        padding:      '1px 4px',
                        borderRadius: 3,
                        whiteSpace:   'nowrap',
                    }}>
                        Ziel {CURRENCY_FMT(targetNet / 12)}\€/Mo
                    </span>
                </div>

                {/* Balken-Reihe — gleiche Höhe wie Container, align-items:flex-end */}
                <div style={{
                    display:    'flex',
                    alignItems: 'flex-end',
                    gap:        3,
                    height:     '100%',
                    minWidth:   'max-content',
                }}>
                    {rows.map(r => {
                        const reached = r.netto >= targetNet
                        const h = Math.max(2, (r.netto / maxVal) * BAR_H)
                        return (
                            <div key={r.year} style={{ display:'flex', flexDirection:'column', alignItems:'center', width:28 }}>
                                <div
                                    title={`${r.year}: € ${CURRENCY_FMT(r.netto)} / Jahr`}
                                    style={{
                                        width:        28,
                                        height:       h,
                                        borderRadius: '3px 3px 0 0',
                                        background:   reached
                                            ? 'linear-gradient(180deg,#5bcec2,#009991)'
                                            : 'linear-gradient(180deg,#3b5bdb,#1e3a5f)',
                                        transition:   'height 0.3s ease',
                                        cursor:       'pointer',
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Jahreslabels — separate Reihe unterhalb der Balken */}
            <div style={{ display:'flex', gap:3, overflowX:'hidden', marginTop:4 }}>
                {rows.map(r => (
                    <div key={r.year} style={{ width:28, flexShrink:0, textAlign:'center' }}>
                        <span style={{ fontSize:9, color:'#3d5266', writingMode:'vertical-rl', transform:'rotate(180deg)', display:'inline-block', height:20 }}>
                            {r.year}
                        </span>
                    </div>
                ))}
            </div>

            {/* Legende */}
            <div style={{ display:'flex', gap:16, marginTop:10, flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#556070' }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', flexShrink:0 }} />
                    Unter Ziel
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#556070' }}>
                    <div style={{ width:12, height:12, borderRadius:2, background:'linear-gradient(180deg,#5bcec2,#009991)', flexShrink:0 }} />
                    Ziel erreicht
                </div>
            </div>
        </div>
    )
}

export default function DividendCalculator({ portfolioData }) {
    const {
        currentValue          = 0,
        totalDividendsNet     = 0,
        dividendYield         = 0,
        forecastDividendYield = 0,
        cagrTotal             = null,
        cagrOrganic           = null,
    } = portfolioData ?? {}

    const defaultGrowthRate = cagrOrganic ?? cagrTotal ?? 5

    const [targetMonthly,    setTargetMonthly]    = useState(500)
    const [growthRate,       setGrowthRate]       = useState(defaultGrowthRate)
    const [useForecastYield, setUseForecastYield] = useState(false)
    const [projectionView,   setProjectionView]   = useState('table')

    const activeYield = useForecastYield ? forecastDividendYield : dividendYield
    const yieldPct    = +(activeYield * 100).toFixed(2)

    const targetAnnual      = targetMonthly * 12
    const requiredCapital   = activeYield > 0 ? targetAnnual / activeYield : 0
    const additionalCapital = Math.max(0, requiredCapital - currentValue)

    const currentNetAnnual  = totalDividendsNet
    const currentNetMonthly = currentNetAnnual / 12
    const progressPct       = targetAnnual > 0 ? Math.min(100, (currentNetAnnual / targetAnnual) * 100) : 0

    const yearsToGoal = yearsToGoalByGrowth(totalDividendsNet, targetAnnual, growthRate)

    const fmtCagrBtn = val => val === null ? '' : val + '%'

    const presets = [
        { label: 'Konservativ',         value: 3,           color: '#556070', disabled: false },
        { label: 'Markt',   value: 5.5,         color: '#34d399', disabled: false },
        { label: 'Organisch',           value: cagrOrganic, color: '#a78bfa', disabled: cagrOrganic === null },
        { label: 'Inkl. Käufe', value: cagrTotal, color: '#60a5fa', disabled: cagrTotal === null },
    ]

    return (
        <div style={{ maxWidth:760, margin:'0 auto', padding:'24px 14px', fontFamily:'system-ui, sans-serif', color:'#e0e6f0' }}>

            <div style={{ marginBottom:24 }}>
                <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>🧮 Dividenden-Rechner</h1>
                <p style={{ color:'#556070', fontSize:14, marginTop:6 }}>
                    Rendite: <strong style={{ color:'#5bcec2' }}>{yieldPct}%</strong>
                    <span style={{ color:'#3d5266', marginLeft:8, fontSize:12 }}>({useForecastYield ? 'Prognose' : 'Aktuell'})</span>
                </p>
            </div>

            <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14, padding:'20px 16px', marginBottom:20, display:'flex', flexDirection:'column', gap:20 }}>

                <Slider label="Ziel-Dividende pro Monat (Netto)" min={100} max={5000} step={50}
                    value={targetMonthly} onChange={setTargetMonthly} unit="€" />

                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <Slider label="Jährl. Dividendenwachstum" min={0} max={30} step={0.5}
                        value={growthRate} onChange={setGrowthRate} unit="%" color="#6366f1" />

                    <div className="calc-cagr-grid">
                        <div style={{ background:'#0f1420', border:'1px solid #1e2a3a', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
                            <div style={{ color:'#3d5266', marginBottom:2 }}>CAGR inkl. Käufe</div>
                            <div style={{ color: cagrTotal === null ? '#3d5266' : '#60a5fa', fontWeight:700, fontSize:15 }}>
                                {cagrTotal === null ? 'Nicht genügend Daten' : cagrTotal + '%'}
                            </div>
                            <div style={{ color:'#3d5266', fontSize:10, marginTop:2 }}>Tatsächl. Wachstum (Käufe + Unternehmen)</div>
                        </div>
                        <div style={{ background:'#0f1420', border:'1px solid #1e2a3a', borderRadius:8, padding:'8px 12px', fontSize:12 }}>
                            <div style={{ color:'#3d5266', marginBottom:2 }}>CAGR organisch</div>
                            <div style={{ color: cagrOrganic === null ? '#3d5266' : '#a78bfa', fontWeight:700, fontSize:15 }}>
                                {cagrOrganic === null ? ' Nicht genügend Daten' : cagrOrganic + '%'}
                            </div>
                            <div style={{ color:'#3d5266', fontSize:10, marginTop:2 }}>Nur Dividendenwachstum der Unternehmen</div>
                        </div>
                    </div>

                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                        {presets.map(p => (
                            <button
                                key={p.label}
                                onClick={() => !p.disabled && p.value !== null && setGrowthRate(p.value)}
                                disabled={p.disabled}
                                style={{
                                    display:'flex', alignItems:'center', gap:6,
                                    padding:'5px 12px', borderRadius:20, fontSize:12,
                                    cursor: p.disabled ? 'not-allowed' : 'pointer',
                                    opacity: p.disabled ? 0.4 : 1,
                                    border: `1px solid ${growthRate === p.value && !p.disabled ? p.color : '#1e2a3a'}`,
                                    background: growthRate === p.value && !p.disabled ? `${p.color}18` : 'transparent',
                                    color: growthRate === p.value && !p.disabled ? p.color : '#556070',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {p.label}
                                <span style={{ fontWeight:700, color: growthRate === p.value && !p.disabled ? p.color : '#3d5266' }}>
                                    {fmtCagrBtn(p.value)}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <span style={{ fontSize:13, color:'#7a8ba0' }}>Rendite-Basis</span>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {[
                            { val: false, label: `Aktuell${(dividendYield * 100).toFixed(2)}%` },
                            { val: true,  label: `Prognose${(forecastDividendYield * 100).toFixed(2)}%` },
                        ].map(({ val, label }) => (
                            <button key={String(val)} onClick={() => setUseForecastYield(val)} style={{
                                padding:'5px 14px', borderRadius:20, fontSize:12, cursor:'pointer',
                                border:'1px solid #2a3a50',
                                background: useForecastYield === val ? '#1e3a5f' : 'transparent',
                                color: useForecastYield === val ? '#93c5fd' : '#556070',
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                            }}>{label}</button>
                        ))}
                    </div>
                </div>

                <div style={{ fontSize:12, color:'#3d5266', padding:'8px 12px', background:'#0f1420', borderRadius:8, border:'1px solid #1e2a3a', lineHeight:1.5 }}>
                    ℹ️ Steuern (inkl. Teilfreistellung für ETFs) bereits in der Prognose eingerechnet
                </div>
            </div>

            <div style={{ fontSize:12, color:'#3d5266', marginBottom:10, paddingLeft:2, lineHeight:1.5 }}>
                💡 Alle Kapitalangaben beziehen sich auf den heutigen Zeitpunkt (nominale Werte, keine Inflationsbereinigung)
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:10, marginBottom:20 }}>
                <ResultCard label="Ben\u00f6tigtes Kapital" value={`€{CURRENCY_FMT(requiredCapital)}`} sub={`f ${targetMonthly}€/Monat netto`} accent />
                <ResultCard label="Noch fehlendes Kapital"
                    value={additionalCapital > 0 ? `€{CURRENCY_FMT(additionalCapital)}` : ' Ziel erreicht!'}
                    sub={additionalCapital > 0 ? `aktuell: €{CURRENCY_FMT(currentValue)}` : undefined} />
                <ResultCard label="Aktuelle Netto-Dividenden"
                    value={`€{CURRENCY_FMT(currentNetMonthly)}/ Mo`}
                    sub={`€${CURRENCY_FMT(currentNetAnnual)}/ Jahr`} />
            </div>

            <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:10 }}>
                    <span style={{ color:'#7a8ba0' }}>Fortschritt zum Ziel</span>
                    <span style={{ color:'#5bcec2', fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>{progressPct.toFixed(1)}</span>
                </div>
                <div style={{ height:8, background:'#1e2a3a', borderRadius:4, overflow:'hidden' }}>
                    <div style={{
                        height:'100%', borderRadius:4, width:`${progressPct}%`,
                        background: progressPct >= 100 ? 'linear-gradient(90deg,#009991,#5bcec2)' : 'linear-gradient(90deg,#009991,#004d49)',
                        transition:'width 0.4s ease',
                    }} />
                </div>
                <div style={{ fontSize:12, color:'#3d5266', marginTop:8, lineHeight:1.5 }}>
                    {progressPct < 100
                        ? `Noch €{CURRENCY_FMT((targetAnnual - currentNetAnnual) / 12)}/ Monat bis zum Ziel`
                        : 'Dein Portfolio erreicht bereits das Ziel!'}
                </div>
            </div>

            {growthRate > 0 && (
                <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14, padding:'18px 16px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:14, flexWrap:'wrap' }}>
                        <div style={{ flex:1, minWidth:0 }}>
                            <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>📈 Wachstums-Projektion</h2>
                            <p style={{ color:'#556070', fontSize:13, marginTop:4, lineHeight:1.5 }}>
                                {yearsToGoal
                                    ? `Bei ${growthRate}% erreichst du dein Ziel in ~${yearsToGoal} Jahren (${new Date().getFullYear() + yearsToGoal})`
                                    : `Mit ${growthRate}% Wachstum wird das Ziel allein durch Dividendenwachstum nicht erreicht. Die nächsten 20 Jahre:`}
                            </p>
                        </div>
                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                            {[{ id:'table', icon:'\u2630' }, { id:'chart', icon:'\u25a6' }].map(v => (
                                <button key={v.id} onClick={() => setProjectionView(v.id)} style={{
                                    padding:'6px 12px', borderRadius:6, fontSize:14, cursor:'pointer',
                                    border:'1px solid #2a3a50',
                                    background: projectionView === v.id ? '#1e3a5f' : 'transparent',
                                    color: projectionView === v.id ? '#93c5fd' : '#556070',
                                    minWidth: 38,
                                }}>{v.icon}</button>
                            ))}
                        </div>
                    </div>
                    {projectionView === 'table' && (
                        <GrowthTable currentDividends={totalDividendsNet} targetNet={targetAnnual} growthRate={growthRate} yearsToGoal={yearsToGoal} />
                    )}
                    {projectionView === 'chart' && (
                        <GrowthChart currentDividends={totalDividendsNet} targetNet={targetAnnual} growthRate={growthRate} yearsToGoal={yearsToGoal} />
                    )}
                </div>
            )}
        </div>
    )
}
