const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export default function UpcomingDividends({ forecastByHolding = {}, byHolding = {}, days = 90 }) {
  const now       = new Date()
  const cy        = now.getFullYear()
  const cm        = now.getMonth()
  const cutoffMs  = now.getTime() + days * 864e5

  // Sammle alle zukünftigen Zahlungen innerhalb der nächsten `days` Tage
  const upcoming = []

  for (const [isin, monthMap] of Object.entries(forecastByHolding)) {
    const name = byHolding[isin]?.name || isin

    for (let offset = 0; offset < 13; offset++) {
      const month = (cm + offset) % 12
      const year  = cy + Math.floor((cm + offset) / 12)

      if (offset === 0) continue // laufender Monat überspringen

      const date = new Date(year, month, 15) // Mitte des Monats als Schätzung
      if (date.getTime() > cutoffMs) continue

      const amount = forecastByHolding[isin]?.[month]
      if (!amount || amount < 0.01) continue

      // Prüfen ob im Vorjahr wirklich in diesem Monat gezahlt wurde (Qualitätsfilter)
      const paidLastYear = (byHolding[isin]?.monthly?.[year - 1]?.[month] ?? 0) > 0
        || (byHolding[isin]?.monthly?.[year]?.[month] ?? 0) > 0

      upcoming.push({ isin, name, month, year, amount, date, paidLastYear })
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
        {Object.values(byMonth).map(group => (
          <div key={`${group.year}-${group.month}`}>
            {/* Monats-Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'#7a8ba0', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                {MONTHS[group.month]} {group.year}
              </span>
              <span style={{ fontSize:12, color:'#22c55e', fontWeight:700 }}>{fmt(group.total)}</span>
            </div>

            {/* Positionen */}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {group.items.map(item => (
                <div key={item.isin} style={{
                  display:      'flex',
                  justifyContent: 'space-between',
                  alignItems:   'center',
                  background:   '#0f1420',
                  border:       `1px solid ${item.paidLastYear ? '#1e2a3a' : '#2a2010'}`,
                  borderRadius: 8,
                  padding:      '7px 12px',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{
                      width:8, height:8, borderRadius:'50%',
                      background: item.paidLastYear ? '#22c55e' : '#fb923c',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize:13, color:'#c8d4e0' }}>{item.name}</span>
                    {!item.paidLastYear && (
                      <span style={{ fontSize:10, color:'#fb923c', background:'#2a1a0a', padding:'1px 6px', borderRadius:10 }}>Neu</span>
                    )}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'#5bcec2' }}>{fmt(item.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize:11, color:'#2a3a50', marginTop:14, lineHeight:1.5 }}>
        ● Grün = im Vorjahr in diesem Monat gezahlt &nbsp;● Orange = erstmalige Prognose
      </p>
    </div>
  )
}
