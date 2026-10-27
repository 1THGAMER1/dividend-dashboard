import { useEffect, useMemo, useState } from 'react'
import { fetchAllDbActivities } from '../utils/manualActivities'

// Cents nur bei Beträgen < 1000€, sonst ganzzahlig
const fmtAmt = n => {
  if (n >= 1000) return Math.round(n).toLocaleString('de-DE') + ' €'
  return (+n).toFixed(2).replace('.', ',') + ' €'
}
const fmtSm = n => {
  if (n >= 1000) return Math.round(n) + ' €'
  if (n >= 100)  return Math.round(n) + ' €'
  return (+n).toFixed(2).replace('.', ',') + ' €'
}

const MONTHS     = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
const MONTH_FULL = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export default function DividendCalendar({
  forecastByHolding = {},
  byHolding = {},
  monthly = {},
  activities = [],
}) {
  const now = new Date()
  const cy  = now.getFullYear()
  const cm  = now.getMonth()

  const [dbActivities, setDbActivities] = useState([])

  useEffect(() => {
    if (activities.length > 0 || Object.keys(monthly).length > 0) return
    fetchAllDbActivities()
      .then(setDbActivities)
      .catch(error => {
        console.warn('Fehler beim Laden der Kalenderdaten aus der Datenbank:', error.message)
        setDbActivities([])
      })
  }, [activities, monthly])

  const localData = useMemo(() => {
    const source = activities.length > 0 ? activities : dbActivities
    if (source.length === 0) return null

    const actualMonthly = {}
    const holdings = {}
    const shares = {}
    const dividends = {}

    source
      .slice()
      .sort((a, b) => new Date(a.date || a.datetime || 0) - new Date(b.date || b.datetime || 0))
      .forEach(activity => {
        const type = String(activity.type || '').toLowerCase()
        const key = activity.isin || activity.name || 'Unbekannt'
        const date = new Date(activity.date || activity.datetime || 0)
        const amount = Number(activity.amountNet ?? activity.amount) || 0
        const quantity = Number(activity.shares) || 0

        if (['buy', 'transfer_in'].includes(type)) shares[key] = (shares[key] || 0) + quantity
        if (['sell', 'transfer_out'].includes(type)) shares[key] = Math.max(0, (shares[key] || 0) - quantity)
        if (type !== 'dividend' || Number.isNaN(date.getTime())) return

        const year = date.getFullYear()
        const month = date.getMonth()
        if (!actualMonthly[year]) actualMonthly[year] = Array(12).fill(0)
        actualMonthly[year][month] = +(actualMonthly[year][month] + amount).toFixed(2)

        const holding = (holdings[key] ||= { name: activity.name || key, monthly: {} })
        if (!holding.monthly[year]) holding.monthly[year] = Array(12).fill(0)
        holding.monthly[year][month] = +(holding.monthly[year][month] + amount).toFixed(2)

        const perShare = quantity > 0 ? amount / quantity : 0
        if (perShare > 0) (dividends[key] ||= {})[month] = perShare
      })

    const forecast = {}
    Object.entries(holdings).forEach(([key, holding]) => {
      forecast[key] = { ...holding, monthly: {} }
      forecast[key].monthly[cy] = Array(12).fill(0)
      for (let month = cm; month < 12; month++) {
        forecast[key].monthly[cy][month] = +((dividends[key]?.[month] || 0) * (shares[key] || 0)).toFixed(2)
      }
    })

    return { monthly: actualMonthly, byHolding: holdings, forecastByHolding: forecast }
  }, [activities, dbActivities, cy, cm])

  const effectiveMonthly = Object.keys(monthly).length > 0 ? monthly : (localData?.monthly || {})
  const effectiveByHolding = Object.keys(byHolding).length > 0 ? byHolding : (localData?.byHolding || {})
  const effectiveForecast = Object.keys(forecastByHolding).length > 0
    ? forecastByHolding
    : (localData?.forecastByHolding || {})

  const monthData = Array.from({ length: 12 }, (_, m) => {
    const isPast    = m < cm
    const isCurrent = m === cm
    const isFuture  = m > cm

    const actual = effectiveMonthly?.[cy]?.[m] ?? 0

    let amount
    let isPrognose

    if (isPast) {
      amount     = actual
      isPrognose = false
    } else if (isCurrent) {
      const forecast = Object.values(effectiveForecast).reduce((s, mMap) => s + (mMap.monthly?.[cy]?.[m] ?? mMap[m] ?? 0), 0)
      amount     = forecast > 0 ? forecast : actual
      isPrognose = true
    } else {
      amount     = Object.values(effectiveForecast).reduce((s, mMap) => s + (mMap.monthly?.[cy]?.[m] ?? mMap[m] ?? 0), 0)
      isPrognose = true
    }

    const positions = Object.entries(effectiveForecast)
        .map(([isin, mMap]) => {
          let posAmount
          if (isPast) {
            posAmount = effectiveByHolding[isin]?.monthly?.[cy]?.[m] ?? 0
          } else {
            posAmount = mMap.monthly?.[cy]?.[m] ?? mMap[m] ?? 0
          }
          return {
            name:   effectiveByHolding[isin]?.name || mMap.name || isin,
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
                    fontSize:    9,
                    fontWeight:  600,
                    color:       isActive ? '#5bcec2' : hasPayment ? '#556070' : '#2a3a50',
                    marginTop:   3,
                    whiteSpace:  'nowrap',
                    overflow:    'hidden',
                    textOverflow:'ellipsis',
                  }}>
                    {hasPayment ? fmtSm(amount) : '–'}
                  </div>

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
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, gap:8 }}>
          <span style={{ fontSize:14, fontWeight:600, color:'#c8d4e0' }}>
            {MONTH_FULL[active.m]} {cy}
            {active.isCurrent && <span style={{ fontSize:11, color:'#22c55e', marginLeft:8 }}>Aktuell</span>}
            {active.isFuture  && <span style={{ fontSize:11, color:'#6366f1', marginLeft:8 }}>Prognose</span>}
          </span>
            <span style={{ fontSize:15, fontWeight:700, color:'#22c55e', whiteSpace:'nowrap', flexShrink:0 }}>
            {active.amount > 0 ? fmtAmt(active.amount) : '–'}
          </span>
          </div>

          {active.positions.length === 0 ? (
              <p style={{ color:'#3d5266', fontSize:13 }}>Keine Dividenden in diesem Monat{active.isPast ? '.' : ' prognostiziert.'}</p>
          ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {active.positions.map(p => (
                    <div key={p.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid #1a2233' }}>
                      <span style={{ fontSize:13, color:'#7a8ba0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0, flex:1 }}>{p.name}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:'#5bcec2', whiteSpace:'nowrap', flexShrink:0 }}>{fmtAmt(p.amount)}</span>
                    </div>
                ))}
              </div>
          )}
        </div>
      </div>
  )
}