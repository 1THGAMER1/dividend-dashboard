/**
 * SkeletonCard – spiegelt die exakte Struktur von KpiCard wider.
 * Gleiche minHeight (110px), gleiches Padding, gleiche Border-Radius.
 */
export default function SkeletonCard() {
  return (
    <div style={{
      background:    '#161b27',
      borderRadius:  12,
      padding:       '16px 20px',
      border:        '1px solid #1e2a3a',
      flex:          '1 1 160px',
      minWidth:      0,
      display:       'flex',
      flexDirection: 'column',
      justifyContent:'space-between',
      minHeight:     110,
    }}>
      {/* Label-Zeile */}
      <div className="skeleton" style={{ height: 10, width: '55%', borderRadius: 4 }} />

      {/* Hauptwert */}
      <div className="skeleton" style={{ height: 30, width: '70%', borderRadius: 6, margin: '10px 0 6px 0' }} />

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="skeleton" style={{ height: 10, width: '40%', borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: '25%', borderRadius: 4 }} />
      </div>
    </div>
  )
}
