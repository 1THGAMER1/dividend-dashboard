import { useState } from 'react'

// Cents nur bei Beträgen < 1000€, sonst ganzzahlig
const fmtAmt = n => {
  if (n >= 1000) return Math.round(n).toLocaleString('de-DE') + ' €'
  return (+n).toFixed(2).replace('.', ',') + ' €'
}
// Kleine Balken-Beschriftung (kompakter)
const fmtSm = n => {
  if (n >= 1000) return Math.round(n) + ' €'
  if (n >= 100)  return Math.round(n) + ' €'
  return (+n).toFixed(2).replace('.', ',') + ' €'
}

const MONTHS     = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const MONTH_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export default function DividendCalendar({ forecastByHolding = {}, byHolding = {}, monthly = {} }) {
  const now = new Date()
  const cy  = now.getFullYear()
  const cm  = now.getMonth()

  const monthData = Array.from({ length: 12 }, (_, m) => {
    const isPast    = m < cm
    const isCurrent = m === cm
    const isFuture  = m > cm

    // Ist-Wert dieses Monats (nur wenn wirklich schon Geld eingegangen ist)
    const actual = monthly?.[cy]?.[m] ?? 0

    let amount
    let isPrognose

    if (isPast) {
      // Vergangener Monat → immer nur Ist-Wert, NIE Prognose
      amount     = actual
      isPrognose = false
    } else if (isCurrent) {
      // Laufender Monat → Ist + ggf. noch ausstehende Prognose (bereits in forecastByHolding kombiniert)
      const forecast = Object.values(forecastByHolding).reduce((s, mMap) => s + (mMap[m] ?? 0), 0)
      amount     = forecast > 0 ? forecast : actual
      isPrognose = true // laufender Monat ist immer "noch nicht abgeschlossen"
    } else {
      // Zukünftiger Monat → reine Prognose
      amount     = Object.values(forecastByHolding).reduce((s, mMap) => s + (mMap[m] ?? 0), 0)
      isPrognose = true
    }

    // Detail-Positionen für die Monats-Detailansicht
    const positions = Object.entries(forecastByHolding)
      .map(([isin, mMap]) => {
        let posAmount
        if (isPast) {
          // Vergangener Monat: nur was wirklich geflossen ist
          posAmount = byHolding[isin]?.monthly?.[cy]?.[m] ?? 0
        } else {
          // Aktuell / Zukunft: aus forecastByHolding (kombiniert Ist + Prognose)
          posAmount = mMap[m] ?? 0
        }
        return {
          name:   byHolding[isin]?.name || isin,
          amount: posAmount,
        }
      })
      .filter(p => p.amount > 0.01)
      .sort((a, b) => b.amount - a.amount)

    return { m, isPast, isCurrent, isFuture, amount, positions, isPrognose }
  })

  const maxAmount = Math.max(...monthData.map(d => d.amount), 0.01)

  const [selected, setSelected] = useState(null)
  const activeMonth = selected ?? cm
  const active      = monthData[activeMonth]

  return (
    <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', margin:0 }}>🗓 Dividenden-Kalender {cy}</h2>
        <span style={{ fontSize:11, color:'#3d5266' }}>Klick auf Monat für Details</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:6, marginBottom:16 }}>
        {monthData.map(({ m, isPast, isCurrent, amount, isPrognose }) => {
          const isActive   = m === activeMonth
          const barH       = amount > 0 ? Math.max(4, (amount / maxAmount) * 48) : 2
          const hasPayment = amount > 0.01

          return (
            <div
              key={m}
              onClick={() => setSelected(m)}
              style={{
                background:   isActive ? '#1a2540' : '#0f1420',
                border:       `1px solid ${isActive ? '#009991' : isCurrent ? '#1e3a2e' : '#1e2a3a'}`,
                borderRadius: 8,
                padding:      '8px 6px 6px',
                cursor:       'pointer',
                transition:   'all 0.15s',
                textAlign:    'center',
                position:     'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#111827' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#0f1420' }}
            >
              <div style={{
                fontSize:   10,
                fontWeight: isCurrent ? 700 : 400,
                color:      isActive ? '#5bcec2' : isCurrent ? '#22c55e' : isPast ? '#556070' : '#7a8ba0',
                marginBottom: 4,
              }}>
                {MONTHS[m]}
              </div>

              <div style={{ height:48, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
                <div style={{
                  width:        '60%',
                  height:       barH,
                  borderRadius: '2px 2px 0 0',
                  background:   !hasPayment ? '#1e2a3a'
                    : isActive   ? '#009991'
                    : isCurrent  ? '#22c55e'
                    : isPast     ? '#3b5bdb'
                    : isPrognose ? '#6366f1'
                    : '#009991',
                  opacity: isPast && !isActive ? 0.6 : 1,
                  transition: 'height 0.3s ease',
                }} />
              </div>

              <div style={{
                fontSize:   9,
                fontWeight: 600,
                color:      isActive ? '#5bcec2' : hasPayment ? '#556070' : '#2a3a50',
                marginTop:  3,
              }}>
                {hasPayment ? fmtSm(amount) : '–'}
              </div>

              {/* Prognose-Punkt nur bei zukünftigen Monaten */}
              {isPrognose && !isCurrent && hasPayment && (
                <div style={{ position:'absolute', top:3, right:4, fontSize:7, color:'#6366f1' }}>●</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:14 }}>
        {[
          { color:'#3b5bdb', label:'Vergangen' },
          { color:'#22c55e', label:'Aktueller Monat' },
          { color:'#6366f1', label:'Prognose' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#556070' }}>
            <div style={{ width:8, height:8, borderRadius:2, background:color }} />
            {label}
          </div>
        ))}
      </div>

      <div style={{
        background:   '#0f1420',
        border:       '1px solid #1e2a3a',
        borderRadius: 10,
        padding:      '14px 16px',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:14, fontWeight:600, color:'#c8d4e0' }}>
            {MONTH_FULL[active.m]} {cy}
            {active.isCurrent && <span style={{ fontSize:11, color:'#22c55e', marginLeft:8 }}>Aktuell</span>}
            {active.isFuture  && <span style={{ fontSize:11, color:'#6366f1', marginLeft:8 }}>Prognose</span>}
          </span>
          <span style={{ fontSize:15, fontWeight:700, color:'#22c55e' }}>
            {active.amount > 0 ? fmtAmt(active.amount) : '–'}
          </span>
        </div>

        {active.positions.length === 0 ? (
          <p style={{ color:'#3d5266', fontSize:13 }}>Keine Dividenden in diesem Monat{active.isPast ? '.' : ' prognostiziert.'}</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {active.positions.map(p => (
              <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #1a2233' }}>
                <span style={{ fontSize:13, color:'#7a8ba0' }}>{p.name}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#5bcec2' }}>{fmtAmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
