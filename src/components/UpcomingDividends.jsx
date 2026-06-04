// Cents nur bei Beträgen < 1000€
const fmtAmt = n => {
  if (n >= 1000) return Math.round(n).toLocaleString('de-DE') + ' €'
  return (+n).toFixed(2).replace('.', ',') + ' €'
}

const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export default function UpcomingDividends({ forecastByHolding = {}, byHolding = {}, days = 90 }) {
  const now      = new Date()
  const cy       = now.getFullYear()
  const cm       = now.getMonth()
  const cutoffMs = now.getTime() + days * 864e5

  const upcoming = []

  for (const [isin, monthMap] of Object.entries(forecastByHolding)) {
    const name = byHolding[isin]?.name || isin

    for (let offset = 0; offset < 13; offset++) {
      const month = (cm + offset) % 12
      const year  = cy + Math.floor((cm + offset) / 12)

      const date = new Date(year, month, 15)
      if (date.getTime() > cutoffMs) continue

      const amount = forecastByHolding[isin]?.[month]
      if (!amount || amount < 0.01) continue

      // Bereits in diesem Monat von dieser Position erhalten?
      const alreadyPaidThisMonth =
        offset === 0 && (byHolding[isin]?.monthly?.[cy]?.[month] ?? 0) > 0

      // Vergangene Monate komplett überspringen
      if (offset === 0 && month < cm) continue  // sollte nicht vorkommen, aber sicher ist sicher

      // Qualitätsfilter: im Vorjahr oder diesem Jahr schon in diesem Monat gezahlt
      const paidLastYear =
        (byHolding[isin]?.monthly?.[year - 1]?.[month] ?? 0) > 0 ||
        (byHolding[isin]?.monthly?.[year]?.[month] ?? 0) > 0

      upcoming.push({
        isin, name, month, year, amount, date, paidLastYear,
        alreadyPaid: alreadyPaidThisMonth,
        isCurrent: offset === 0,
      })
    }
  }

  upcoming.sort((a, b) => a.date - b.date)

  if (upcoming.length === 0) {
    return (
      <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:12 }}>📅 Nächste Dividendenzahlungen</h2>
        <p style={{ color:'#3d5266', fontSize:13 }}>Keine Prognose-Daten verfügbar.</p>
      </div>
    )
  }

  // Gruppieren nach Monat
  const byMonth = {}
  for (const item of upcoming) {
    const key = `${item.year}-${item.month}`
    if (!byMonth[key]) byMonth[key] = { year: item.year, month: item.month, items: [], total: 0 }
    byMonth[key].items.push(item)
    byMonth[key].total += item.amount
  }

  return (
    <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', margin:0 }}>📅 Nächste Dividendenzahlungen</h2>
        <span style={{ fontSize:11, color:'#3d5266' }}>nächste {days} Tage · Prognose</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {Object.values(byMonth).map(group => {
          const isCurrentMonth = group.year === cy && group.month === cm
          return (
            <div key={`${group.year}-${group.month}`}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <span style={{ fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em',
                  color: isCurrentMonth ? '#22c55e' : '#7a8ba0' }}>
                  {MONTHS[group.month]} {group.year}
                  {isCurrentMonth && <span style={{ marginLeft:6, fontSize:10, color:'#22c55e' }}>· laufender Monat</span>}
                </span>
                <span style={{ fontSize:12, color:'#22c55e', fontWeight:700 }}>{fmtAmt(group.total)}</span>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {group.items.map(item => (
                  <div key={item.isin} style={{
                    display:         'flex',
                    justifyContent:  'space-between',
                    alignItems:      'center',
                    background:      item.alreadyPaid ? '#0d1f12' : '#0f1420',
                    border:          `1px solid ${item.alreadyPaid ? '#1a3a22' : item.paidLastYear ? '#1e2a3a' : '#2a2010'}`,
                    borderRadius:    8,
                    padding:         '7px 12px',
                    opacity:         item.alreadyPaid ? 0.65 : 1,
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{
                        width:8, height:8, borderRadius:'50%', flexShrink:0,
                        background: item.alreadyPaid ? '#15803d' : item.paidLastYear ? '#22c55e' : '#fb923c',
                      }} />
                      <span style={{ fontSize:13, color: item.alreadyPaid ? '#556070' : '#c8d4e0' }}>{item.name}</span>
                      {item.alreadyPaid && (
                        <span style={{ fontSize:10, color:'#15803d', background:'#0d2418', padding:'1px 6px', borderRadius:10 }}>✓ erhalten</span>
                      )}
                      {!item.alreadyPaid && !item.paidLastYear && (
                        <span style={{ fontSize:10, color:'#fb923c', background:'#2a1a0a', padding:'1px 6px', borderRadius:10 }}>Neu</span>
                      )}
                    </div>
                    <span style={{ fontSize:13, fontWeight:600, color: item.alreadyPaid ? '#3d6b4a' : '#5bcec2' }}>
                      {fmtAmt(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize:11, color:'#2a3a50', marginTop:14, lineHeight:1.5 }}>
        ● Grün = im Vorjahr in diesem Monat gezahlt &nbsp;● Orange = erstmalige Prognose &nbsp;● Ausgegraut = bereits erhalten
      </p>
    </div>
  )
}
