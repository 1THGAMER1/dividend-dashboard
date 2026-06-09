import { useState, useMemo } from 'react'

const EUR = v => v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
const EUR2 = v => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const PCT  = v => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'

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

/**
 * Simuliert ein Portfolio über N Jahre.
 * @param {object} p
 * @param {number} p.startCapital       - Aktueller Portfoliowert (€)
 * @param {number} p.annualDivNet        - Aktuelle Netto-Dividenden pro Jahr (€)
 * @param {number} p.divYieldPct         - Aktuelle Dividendenrendite (%)
 * @param {number} p.priceGrowthPct      - Erwartetes jährl. Kurswachstum (%)
 * @param {number} p.divGrowthPct        - Erwartetes jährl. organisches Dividendenwachstum (%)
 * @param {number} p.extraMonthly        - Zusätzliche monatliche Einzahlungen (€)
 * @param {number} p.years               - Simulationszeitraum
 * @param {boolean} p.drip               - true = reinvestieren, false = auszahlen
 * @returns {{ year, capital, divNet, divNetMonthly }[]}
 */
function simulate({ startCapital, annualDivNet, divYieldPct, priceGrowthPct, divGrowthPct, extraMonthly, years, drip }) {
  const rows = []
  let capital = startCapital
  let divNet  = annualDivNet
  const yieldFrac = divYieldPct / 100

  for (let y = 1; y <= years; y++) {
    // 1. Kurswachstum auf bestehendes Kapital
    capital *= 1 + priceGrowthPct / 100

    // 2. Monatliche Einzahlungen (12 Mal)
    capital += extraMonthly * 12

    // 3. Dividendenwachstum (organisch)
    divNet *= 1 + divGrowthPct / 100

    // 4. DRIP: Dividenden reinvestieren → mehr Kapital → höhere künftige Dividenden
    if (drip) {
      capital += divNet
      // Nächstes Jahr: höhere Dividenden durch größeres Kapital
      // Wir passen divNet ans neue Kapital an
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

const BAR_H = 180

function CompareChart({ dripRows, noDripRows, years }) {
  const maxCap = Math.max(...dripRows.map(r => r.capital), ...noDripRows.map(r => r.capital))
  const step   = years > 20 ? 5 : years > 10 ? 2 : 1
  const shown  = dripRows.filter((_, i) => (i + 1) % step === 0 || i === 0 || i === dripRows.length - 1)

  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ minWidth: Math.max(320, shown.length * 52), paddingBottom:4 }}>
        {/* Balken */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:BAR_H }}>
          {shown.map((dr, i) => {
            const nd  = noDripRows.find(r => r.year === dr.year)
            const dH  = Math.max(2, (dr.capital / maxCap) * BAR_H)
            const ndH = Math.max(2, ((nd?.capital ?? 0) / maxCap) * BAR_H)
            return (
              <div key={dr.year} style={{ display:'flex', alignItems:'flex-end', gap:2, flex:1 }}>
                {/* Ohne DRIP */}
                <div
                  title={`${dr.year} ohne DRIP: ${EUR(nd?.capital ?? 0)}`}
                  style={{ flex:1, height:ndH, borderRadius:'3px 3px 0 0',
                    background:'linear-gradient(180deg,#3b5bdb,#1e3a5f)', cursor:'pointer' }}
                />
                {/* Mit DRIP */}
                <div
                  title={`${dr.year} mit DRIP: ${EUR(dr.capital)}`}
                  style={{ flex:1, height:dH, borderRadius:'3px 3px 0 0',
                    background:'linear-gradient(180deg,#5bcec2,#009991)', cursor:'pointer' }}
                />
              </div>
            )
          })}
        </div>

        {/* Jahreslabels */}
        <div style={{ display:'flex', gap:4, marginTop:4 }}>
          {shown.map(dr => (
            <div key={dr.year} style={{ flex:1, textAlign:'center',
              fontSize:9, color:'#3d5266', whiteSpace:'nowrap' }}>
              {dr.year}
            </div>
          ))}
        </div>

        {/* Legende */}
        <div style={{ display:'flex', gap:20, marginTop:12, flexWrap:'wrap' }}>
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

function DivChart({ dripRows, noDripRows }) {
  const maxDiv = Math.max(...dripRows.map(r => r.divNet), ...noDripRows.map(r => r.divNet))
  return (
    <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
      <div style={{ minWidth: Math.max(320, dripRows.length * 28), paddingBottom:4 }}>
        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:120 }}>
          {dripRows.map((dr, i) => {
            const nd   = noDripRows[i]
            const dH   = Math.max(2, (dr.divNet / maxDiv) * 120)
            const ndH  = Math.max(2, ((nd?.divNet ?? 0) / maxDiv) * 120)
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
        <div style={{ display:'flex', gap:2, marginTop:4 }}>
          {dripRows.map((dr, i) => (
            (i % Math.ceil(dripRows.length / 8) === 0 || i === dripRows.length - 1) &&
            <div key={dr.year} style={{ flex:1, textAlign:'center',
              fontSize:9, color:'#3d5266', whiteSpace:'nowrap' }}>
              {dr.year}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DripSimulator({ portfolioData }) {
  const {
    currentValue      = 0,
    totalDividendsNet = 0,
    dividendYield     = 0,  // als Dezimal z. B. 0.034
    cagrTotal         = null,
  } = portfolioData ?? {}

  const divYieldPct    = +(dividendYield * 100).toFixed(2) || 3.5
  const defaultGrowth  = cagrTotal ?? 5

  const [years,          setYears]          = useState(20)
  const [priceGrowth,    setPriceGrowth]    = useState(4)
  const [divGrowth,      setDivGrowth]      = useState(defaultGrowth)
  const [extraMonthly,   setExtraMonthly]   = useState(0)
  const [chartView,      setChartView]      = useState('capital') // 'capital' | 'dividends'

  const commonParams = {
    startCapital:  currentValue  || 10000,
    annualDivNet:  totalDividendsNet || (currentValue * divYieldPct / 100),
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

  return (
    <div style={{ maxWidth:800, margin:'0 auto', padding:'24px 14px', color:'#e0e6f0' }}>

      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>♻️ Reinvestitions-Simulator</h1>
        <p style={{ color:'#556070', fontSize:13, marginTop:6, lineHeight:1.5 }}>
          Vergleich: Dividenden reinvestieren (DRIP) vs. als Einkommen entnehmen
        </p>
      </div>

      {noData && (
        <div style={{ background:'#1a1a0a', border:'1px solid #713f12', color:'#fde68a',
          borderRadius:10, padding:'12px 16px', fontSize:13, marginBottom:20 }}>
          ⚠️ Keine Portfolio-Daten verfügbar — die Simulation läuft mit Beispielwerten (10.000 € / 3,5 % Rendite).
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

        <Slider label="Dividendenwachstum p.a." min={0} max={20} step={0.5}
          value={divGrowth} onChange={setDivGrowth} unit="%" color="#a78bfa" />

        <Slider label="Zusätzliche Einzahlungen / Monat" min={0} max={2000} step={50}
          value={extraMonthly} onChange={setExtraMonthly} unit=" €" color="#f472b6"
          hint="Sparrate" />

        {/* Hinweis-Box */}
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

      {/* Chart-Tabs + Charts */}
      <div style={{ background:'#161b27', border:'1px solid #1e2a3a', borderRadius:14, padding:'18px 16px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:8, flexWrap:'wrap' }}>
          <h2 style={{ fontSize:15, fontWeight:600, margin:0 }}>📊 Entwicklung über {years} Jahre</h2>
          <div style={{ display:'flex', gap:4 }}>
            {[{ id:'capital', label:'Kapital' }, { id:'dividends', label:'Dividenden' }].map(t => (
              <button key={t.id} onClick={() => setChartView(t.id)} style={{
                padding:'5px 12px', borderRadius:8, fontSize:12, cursor:'pointer',
                border:'1px solid #2a3a50',
                background: chartView === t.id ? '#1e3a5f' : 'transparent',
                color: chartView === t.id ? '#93c5fd' : '#556070',
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
                {['Jahr',
                  'Kapital mit DRIP', 'Kapital ohne DRIP',
                  'Div. mit DRIP /Mo', 'Div. ohne DRIP /Mo',
                  'DRIP-Vorteil'
                ].map(h => (
                  <th key={h} style={{ padding:'8px 10px', textAlign:'left',
                    color:'#556070', fontWeight:500, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dripRows.map((dr, i) => {
                const nd      = noDripRows[i]
                const diff    = dr.capital - (nd?.capital ?? 0)
                const show    = dripRows.length <= 25 || (i + 1) % Math.ceil(dripRows.length / 20) === 0 || i === 0 || i === dripRows.length - 1
                if (!show) return null
                return (
                  <tr key={dr.year} style={{
                    borderBottom: '1px solid #111827',
                    background: diff > 0 ? 'rgba(0,153,145,0.04)' : 'transparent',
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
