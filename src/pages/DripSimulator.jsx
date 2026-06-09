import { useState, useMemo } from 'react'

const EUR  = v => v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
const EUR2 = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

function Slider({ label, min, max, step, value, onChange, unit, color = '#009991', hint }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
        <span style={{ color:'#7a8ba0' }}>{label}</span>
        <span style={{ color:'#e0e6f0', fontWeight:600, whiteSpace:'nowrap', marginLeft:8 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ accentColor:color, width:'100%', cursor:'pointer', height:4 }}
      />
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#3d5266' }}>
        <span>{min}{unit}</span>
        {hint && <span style={{ color:'#556070', fontSize:10 }}>{hint}</span>}
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

function KpiBox({ label, value, sub, color = '#e0e6f0', accent = false }) {
  return (
    <div style={{
      background:   accent ? 'linear-gradient(135deg,#003d3a,#001a18)' : '#0f1420',
      border:       `1px solid ${accent ? '#009991' : '#1e2a3a'}`,
      borderRadius: 12,
      padding:      '14px 16px',
      minWidth:     0,
    }}>
      <div style={{ fontSize:11, color:'#556070', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      <div style={{ fontSize:accent ? 22 : 18, fontWeight:700, color: accent ? '#5bcec2' : color }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#3d5266', marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function simulate({ startCapital, annualDivNet, divYieldPct, priceGrowthPct, divGrowthPct, extraMonthly, years, drip }) {
  const rows = []
  let capital = startCapital
  let divNet  = annualDivNet
  const yieldFrac = divYieldPct / 100

  for (let y = 1; y <= years; y++) {
    capital *= 1 + priceGrowthPct / 100
    capital += extraMonthly * 12
    divNet  *= 1 + divGrowthPct / 100
    if (drip) {
      capital += divNet
      divNet = capital * yieldFrac * (1 + divGrowthPct / 100)
    }
    rows.push({
      year:          new Date().getFullYear() + y,
      capital:       Math.round(capital),
      divNet:        +divNet.toFixed(2),
      divNetMonthly: +(divNet / 12).toFixed(2),
    })
  }
  return rows
}

// Formatiert einen Eurobetrag kurz: 1.234.567 -> "1,2 Mio" / 12345 -> "12.345"
function fmtShort(v) {
  if (v >= 1_000_000) return (v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + '\u00a0Mio\u00a0€'
  if (v >= 10_000)    return Math.round(v / 1000).toLocaleString('de-DE') + '\u00a0T€'
  return v.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + '\u00a0€'
}

const BAR_H    = 180
const Y_LABELS = 4   // Anzahl Y-Achsen-Beschriftungen

function YAxis({ maxVal, height, formatter }) {
  const steps = Array.from({ length: Y_LABELS + 1 }, (_, i) => (Y_LABELS - i) / Y_LABELS)
  return (
    <div style={{ position:'absolute', left:0, top:0, bottom:20, width:56,
      display:'flex', flexDirection:'column', justifyContent:'space-between', pointerEvents:'none' }}>
      {steps.map((frac, i) => (
        <div key={i} style={{ fontSize:9, color:'#3d5266', whiteSpace:'nowrap',
          textAlign:'right', paddingRight:4, lineHeight:1 }}>
          {frac === 0 ? '' : formatter(maxVal * frac)}
        </div>
      ))}
    </div>
  )
}

function CompareChart({ dripRows, noDripRows, years }) {
  const maxCap = Math.max(...dripRows.map(r => r.capital), ...noDripRows.map(r => r.capital))
  const step   = years > 20 ? 5 : years > 10 ? 2 : 1
  const shown  = dripRows.filter((_, i) => (i + 1) % step === 0 || i === 0 || i === dripRows.length - 1)

  // Horizontale Hilfslinien
  const gridLines = Array.from({ length: Y_LABELS }, (_, i) => ((i + 1) / Y_LABELS) * BAR_H)

  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ minWidth: Math.max(320, shown.length * 52 + 60), paddingBottom:4 }}>
        {/* Chart-Bereich mit Y-Achse */}
        <div style={{ position:'relative', paddingLeft:60 }}>

          <YAxis maxVal={maxCap} height={BAR_H} formatter={fmtShort} />

          {/* Hilfslinien */}
          <div style={{ position:'absolute', left:60, right:0, top:0, height:BAR_H, pointerEvents:'none' }}>
            {gridLines.map((y, i) => (
              <div key={i} style={{
                position:'absolute', left:0, right:0,
                bottom: y, borderTop:'1px solid rgba(255,255,255,0.04)',
              }} />
            ))}
          </div>

          {/* Balken */}
          <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:BAR_H }}>
            {shown.map((dr) => {
              const nd  = noDripRows.find(r => r.year === dr.year)
              const dH  = Math.max(2, (dr.capital / maxCap) * BAR_H)
              const ndH = Math.max(2, ((nd?.capital ?? 0) / maxCap) * BAR_H)
              return (
                <div key={dr.year} style={{ display:'flex', alignItems:'flex-end', gap:2, flex:1 }}>
                  <div title={`${dr.year} ohne DRIP: ${EUR(nd?.capital ?? 0)}`}
                    style={{ flex:1, height:ndH, borderRadius:'3px 3px 0 0',
                      background:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', cursor:'pointer' }} />
                  <div title={`${dr.year} mit DRIP: ${EUR(dr.capital)}`}
                    style={{ flex:1, height:dH, borderRadius:'3px 3px 0 0',
                      background:'linear-gradient(180deg,#5bcec2,#009991)', cursor:'pointer' }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Jahreslabels */}
        <div style={{ display:'flex', gap:4, marginTop:4, paddingLeft:60 }}>
          {shown.map(dr => (
            <div key={dr.year} style={{ flex:1, textAlign:'center',
              fontSize:9, color:'#3d5266', whiteSpace:'nowrap' }}>
              {dr.year}
            </div>
          ))}
        </div>

        {/* Legende */}
        <div style={{ display:'flex', gap:20, marginTop:12, paddingLeft:60, flexWrap:'wrap' }}>
          {[
            { color:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', label:'Ohne DRIP' },
            { color:'linear-gradient(180deg,#5bcec2,#009991)', label:'Mit DRIP' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#7a8ba0' }}>
              <div style={{ width:12, height:12, borderRadius:2, background:color, flexShrink:0 }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const DIV_H = 140

function DivChart({ dripRows, noDripRows }) {
  const maxDiv = Math.max(...dripRows.map(r => r.divNet), ...noDripRows.map(r => r.divNet))
  const gridLines = Array.from({ length: Y_LABELS }, (_, i) => ((i + 1) / Y_LABELS) * DIV_H)

  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ minWidth: Math.max(320, dripRows.length * 28 + 60), paddingBottom:4 }}>
        <div style={{ position:'relative', paddingLeft:60 }}>

          <YAxis maxVal={maxDiv} height={DIV_H} formatter={fmtShort} />

          {/* Hilfslinien */}
          <div style={{ position:'absolute', left:60, right:0, top:0, height:DIV_H, pointerEvents:'none' }}>
            {gridLines.map((y, i) => (
              <div key={i} style={{ position:'absolute', left:0, right:0,
                bottom:y, borderTop:'1px solid rgba(255,255,255,0.04)' }} />
            ))}
          </div>

          <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:DIV_H }}>
            {dripRows.map((dr, i) => {
              const nd  = noDripRows[i]
              const dH  = Math.max(2, (dr.divNet / maxDiv) * DIV_H)
              const ndH = Math.max(2, ((nd?.divNet ?? 0) / maxDiv) * DIV_H)
              return (
                <div key={dr.year} style={{ display:'flex', alignItems:'flex-end', gap:1, flex:1 }}>
                  <div title={`${dr.year} Div ohne DRIP: ${EUR2(nd?.divNet ?? 0)}/Jahr`}
                    style={{ flex:1, height:ndH, borderRadius:'2px 2px 0 0',
                      background:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', cursor:'pointer' }} />
                  <div title={`${dr.year} Div mit DRIP: ${EUR2(dr.divNet)}/Jahr`}
                    style={{ flex:1, height:dH, borderRadius:'2px 2px 0 0',
                      background:'linear-gradient(180deg,#f472b6,#be185d)', cursor:'pointer' }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Jahreslabels */}
        <div style={{ display:'flex', gap:2, marginTop:4, paddingLeft:60 }}>
          {dripRows.map((dr, i) => (
            (i % Math.ceil(dripRows.length / 8) === 0 || i === dripRows.length - 1)
              ? <div key={dr.year} style={{ flex:1, textAlign:'center',
                  fontSize:9, color:'#3d5266', whiteSpace:'nowrap' }}>{dr.year}</div>
              : <div key={dr.year} style={{ flex:1 }} />
          ))}
        </div>

        {/* Legende */}
        <div style={{ display:'flex', gap:20, marginTop:12, paddingLeft:60, flexWrap:'wrap' }}>
          {[
            { color:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', label:'Ohne DRIP' },
            { color:'linear-gradient(180deg,#f472b6,#be185d)', label:'Mit DRIP' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#7a8ba0' }}>
              <div style={{ width:12, height:12, borderRadius:2, background:color, flexShrink:0 }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DripSimulator({ portfolioData }) {
  const {
    currentValue          = 0,
    totalDividendsNet     = 0,
    dividendYield         = 0,   // Dezimalbruch z.B. 0.034  (aktuell)
    forecastDividendYield = 0,   // Dezimalbruch z.B. 0.038  (Prognose)
    cagrTotal             = null,
    cagrOrganic           = null,
  } = portfolioData ?? {}

  // ---- identisch zum Rechner ----
  const defaultGrowth      = cagrOrganic ?? cagrTotal ?? 5
  const [useForecastYield, setUseForecastYield] = useState(false)

  const activeYield    = useForecastYield ? forecastDividendYield : dividendYield
  const divYieldPct    = +(activeYield * 100).toFixed(2) || 3.5
  // --------------------------------

  const [years,        setYears]        = useState(20)
  const [priceGrowth,  setPriceGrowth]  = useState(4)
  const [divGrowth,    setDivGrowth]    = useState(defaultGrowth)
  const [extraMonthly, setExtraMonthly] = useState(0)
  const [chartView,    setChartView]    = useState('capital')

  const commonParams = {
    startCapital:   currentValue || 10000,
    annualDivNet:   totalDividendsNet || ((currentValue || 10000) * divYieldPct / 100),
    divYieldPct,
    priceGrowthPct: priceGrowth,
    divGrowthPct:   divGrowth,
    extraMonthly,
    years,
  }

  const dripRows   = useMemo(() => simulate({ ...commonParams, drip: true  }), [JSON.stringify(commonParams)])
  const noDripRows = useMemo(() => simulate({ ...commonParams, drip: false }), [JSON.stringify(commonParams)])

  const lastDrip   = dripRows[dripRows.length - 1]   ?? {}
  const lastNodrip = noDripRows[noDripRows.length - 1] ?? {}

  const capitalDiff  = (lastDrip.capital ?? 0) - (lastNodrip.capital ?? 0)
  const divDiff      = (lastDrip.divNet  ?? 0) - (lastNodrip.divNet  ?? 0)
  const capitalBoost = lastNodrip.capital > 0
    ? ((lastDrip.capital / lastNodrip.capital - 1) * 100).toFixed(1)
    : '–'

  const noData = !currentValue && !totalDividendsNet

  // CAGR-Presets wie im Rechner
  const presets = [
    { label: 'Konservativ', value: 3,           color: '#556070', disabled: false },
    { label: 'Markt',       value: 5.5,         color: '#34d399', disabled: false },
    { label: 'Organisch',   value: cagrOrganic, color: '#a78bfa', disabled: cagrOrganic === null },
    { label: 'Inkl. Käufe', value: cagrTotal,   color: '#60a5fa', disabled: cagrTotal   === null },
  ]

  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'24px 14px', color:'#e0e6f0' }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>♻️ Reinvestitions-Simulator</h1>
        <p style={{ color:'#556070', fontSize:13, marginTop:6, lineHeight:1.5 }}>
          Rendite: <strong style={{ color:'#5bcec2' }}>{divYieldPct} %</strong>
          <span style={{ color:'#3d5266', marginLeft:8, fontSize:12 }}>({useForecastYield ? 'Prognose' : 'Aktuell'})</span>
        </p>
      </div>

      {noData && (
        <div style={{ background:'#1a1a0a', border:'1px solid #713f12', color:'#fde68a',
          borderRadius:10, padding:'12px 16px', fontSize:13, marginBottom:20 }}>
          ⚠️ Keine Portfolio-Daten verfügbar — die Simulation läuft mit Beispielwerten (10.000 € / 3,5 % Rendite).
        </div>
      )}

      {/* Eingaben */}
      <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14,
        padding:'20px 16px', marginBottom:20, display:'flex', flexDirection:'column', gap:20 }}>

        <Slider label="Simulationszeitraum" min={5} max={40} step={1}
          value={years} onChange={setYears} unit=" Jahre" />

        <Slider label="Erwartetes Kurswachstum p.a." min={0} max={15} step={0.5}
          value={priceGrowth} onChange={setPriceGrowth} unit="%" color="#60a5fa"
          hint="S&P 500 hist. ≈10%" />

        {/* Dividendenwachstum + Presets — identisch zum Rechner */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <Slider label="Dividendenwachstum p.a." min={0} max={20} step={0.5}
            value={divGrowth} onChange={setDivGrowth} unit="%" color="#a78bfa" />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {presets.map(p => (
              <button key={p.label} disabled={p.disabled}
                onClick={() => !p.disabled && p.value !== null && setDivGrowth(p.value)}
                style={{
                  background:'#0f1420', border:'1px solid #1e2a3a', borderRadius:8,
                  padding:'8px 12px', fontSize:12, cursor: p.disabled ? 'default' : 'pointer',
                  opacity: p.disabled ? 0.4 : 1, textAlign:'left',
                }}>
                <div style={{ color:'#3d5266', marginBottom:2 }}>{p.label}</div>
                <div style={{ color: p.disabled ? '#3d5266' : p.color, fontWeight:700, fontSize:15 }}>
                  {p.disabled || p.value === null ? 'Keine Daten' : p.value + '%'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dividendenrendite-Toggle — identisch zum Rechner */}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ fontSize:13, color:'#7a8ba0' }}>Dividendenrendite</div>
          <div style={{ display:'flex', gap:8 }}>
            {[
              { id: false, label: 'Aktuell',  value: +(dividendYield * 100).toFixed(2) },
              { id: true,  label: 'Prognose', value: +(forecastDividendYield * 100).toFixed(2) },
            ].map(opt => (
              <button key={String(opt.id)}
                onClick={() => setUseForecastYield(opt.id)}
                style={{
                  flex:1, padding:'10px 12px', borderRadius:10, fontSize:12,
                  cursor:'pointer', textAlign:'left',
                  border: useForecastYield === opt.id ? '1px solid #009991' : '1px solid #1e2a3a',
                  background: useForecastYield === opt.id
                    ? 'linear-gradient(135deg,#003d3a,#001a18)' : '#0f1420',
                }}>
                <div style={{ color:'#556070', marginBottom:3, fontSize:11 }}>{opt.label}</div>
                <div style={{ color: useForecastYield === opt.id ? '#5bcec2' : '#e0e6f0',
                  fontWeight:700, fontSize:16 }}>
                  {opt.value.toFixed(2)} %
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sparrate bis 5000 € */}
        <Slider label="Zusätzliche Einzahlungen / Monat" min={0} max={5000} step={50}
          value={extraMonthly} onChange={setExtraMonthly} unit=" €" color="#f472b6"
          hint="Sparrate" />

        {/* Info-Box */}
        <div style={{ fontSize:12, color:'#3d5266', padding:'8px 12px',
          background:'#0f1420', borderRadius:8, border:'1px solid #1e2a3a', lineHeight:1.5 }}>
          ℹ️ Startkapital: <strong style={{ color:'#556070' }}>{EUR(commonParams.startCapital)}</strong>
          {' · '}
          Div.-Rendite: <strong style={{ color:'#556070' }}>{divYieldPct.toFixed(2)} %</strong>
          {' · '}
          Netto-Dividenden heute: <strong style={{ color:'#556070' }}>{EUR2(commonParams.annualDivNet)}/Jahr</strong>
        </div>
      </div>

      {/* Ergebniskarten */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:20 }}>
        <KpiBox label={`Kapital mit DRIP (${years}J)`}
          value={EUR(lastDrip.capital ?? 0)}
          sub={`Div: ${EUR2(lastDrip.divNet ?? 0)}/Jahr`}
          color="#5bcec2" accent />
        <KpiBox label={`Kapital ohne DRIP (${years}J)`}
          value={EUR(lastNodrip.capital ?? 0)}
          sub={`Div: ${EUR2(lastNodrip.divNet ?? 0)}/Jahr`}
          color="#60a5fa" />
        <KpiBox label="DRIP-Mehrwert (Kapital)"
          value={`+${EUR(capitalDiff)}`}
          sub={`+${capitalBoost} % mehr Kapital`}
          color="#22c55e" />
        <KpiBox label="DRIP-Mehrwert (Dividenden)"
          value={`+${EUR2(divDiff)}/Jahr`}
          sub={`+${EUR2(divDiff/12)}/Monat mehr`}
          color="#f472b6" />
      </div>

      {/* Chart */}
      <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14, padding:'18px 16px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8, flexWrap:'wrap' }}>
          <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>📊 Entwicklung über {years} Jahre</h2>
          <div style={{ display:'flex', gap:4 }}>
            {[{ id:'capital', label:'Kapital' }, { id:'dividends', label:'Dividenden' }].map(t => (
              <button key={t.id} onClick={() => setChartView(t.id)} style={{
                padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer',
                border:'1px solid #2a3a50',
                background: chartView === t.id ? '#1e3a5f' : 'transparent',
                color:      chartView === t.id ? '#93c5fd' : '#556070',
              }}>{t.label}</button>
            ))}
          </div>
        </div>
        {chartView === 'capital'   && <CompareChart dripRows={dripRows} noDripRows={noDripRows} years={years} />}
        {chartView === 'dividends' && <DivChart     dripRows={dripRows} noDripRows={noDripRows} />}
      </div>

      {/* Detailtabelle */}
      <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14, padding:'18px 16px' }}>
        <h2 style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>📋 Jahr-für-Jahr Vergleich</h2>
        <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:520 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1e2a3a' }}>
                {['Jahr','Kapital mit DRIP','Kapital ohne DRIP',
                  'Div. mit DRIP /Mo','Div. ohne DRIP /Mo','DRIP-Vorteil'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left',
                    color:'#556070', fontWeight:500, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dripRows.map((dr, i) => {
                const nd   = noDripRows[i]
                const diff = dr.capital - (nd?.capital ?? 0)
                const show = dripRows.length <= 25
                  || (i + 1) % Math.ceil(dripRows.length / 20) === 0
                  || i === 0 || i === dripRows.length - 1
                if (!show) return null
                return (
                  <tr key={dr.year} style={{
                    borderBottom: '1px solid #111827',
                    background:   diff > 0 ? 'rgba(0,153,145,0.04)' : 'transparent',
                  }}>
                    <td style={{ padding:'7px 10px', color:'#7a8ba0', whiteSpace:'nowrap' }}>{dr.year}</td>
                    <td style={{ padding:'7px 10px', color:'#5bcec2', whiteSpace:'nowrap', fontWeight:600 }}>{EUR(dr.capital)}</td>
                    <td style={{ padding:'7px 10px', color:'#60a5fa', whiteSpace:'nowrap' }}>{EUR(nd?.capital ?? 0)}</td>
                    <td style={{ padding:'7px 10px', color:'#f472b6', whiteSpace:'nowrap' }}>{EUR2(dr.divNetMonthly)}</td>
                    <td style={{ padding:'7px 10px', color:'#94a3b8', whiteSpace:'nowrap' }}>{EUR2(nd?.divNetMonthly ?? 0)}</td>
                    <td style={{ padding:'7px 10px', color:'#22c55e', whiteSpace:'nowrap', fontWeight:600 }}>+{EUR(diff)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
