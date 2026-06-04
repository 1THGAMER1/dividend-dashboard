import { heatColor } from '../dataUtils'

const MONTHS = ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

function fmt(n) {
  if (!n || n <= 0) return ''
  if (n < 10)  return (+n).toFixed(2) + '€'
  if (n < 100) return (+n).toFixed(1) + '€'
  return (+n).toFixed(0) + '€'
}

export default function DividendHeatmap({ monthly = {} }) {
  const years   = Object.keys(monthly).map(Number).sort()
  const allVals = years.flatMap(y => monthly[y] || []).filter(v => v > 0)
  const maxVal  = allVals.length ? Math.max(...allVals) : 1

  return (
    <div style={{ background:'#161b27', borderRadius:12, padding:20, border:'1px solid #222d3d', marginBottom:20 }}>
      <h2 style={{ fontSize:15, fontWeight:600, color:'#c8d4e0', marginBottom:14 }}>Dividenden-Heatmap</h2>

      {/* Single container — scrolls horizontally on mobile */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 480 }}>

          {/* Header row */}
          <div style={{ display:'grid', gridTemplateColumns:'44px repeat(12, 1fr)', gap:3, marginBottom:3 }}>
            <div />
            {MONTHS.map(m => (
              <div key={m} style={{ fontSize:10, color:'#556070', textAlign:'center', padding:'2px 0' }}>{m}</div>
            ))}
          </div>

          {/* Data rows */}
          {years.map(y => (
            <div key={y} style={{ display:'grid', gridTemplateColumns:'44px repeat(12, 1fr)', gap:3, marginBottom:3 }}>
              <div style={{ fontSize:11, color:'#7a8ba0', display:'flex', alignItems:'center' }}>{y}</div>
              {(monthly[y] || Array(12).fill(0)).map((val, m) => {
                const intensity = val > 0 ? Math.min(val / maxVal, 1) : 0
                const bg        = heatColor(val, maxVal)
                const textColor = intensity > 0.4 ? '#ffffff' : intensity > 0 ? '#c8f0d8' : 'transparent'
                return (
                  <div
                    key={m}
                    title={`${MONTHS[m]} ${y}: ${val > 0 ? (+val).toFixed(2) + ' €' : '–'}`}
                    style={{
                      background:   bg,
                      borderRadius: 4,
                      padding:      '6px 2px',
                      textAlign:    'center',
                      fontSize:     9,
                      color:        textColor,
                      fontWeight:   600,
                    }}
                  >
                    {fmt(val)}
                  </div>
                )
              })}
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}
