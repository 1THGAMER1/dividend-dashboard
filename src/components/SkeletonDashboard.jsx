import SkeletonCard from './SkeletonCard'

/**
 * SkeletonDashboard – komplettes Lade-Skelett für den Dashboard-Tab.
 * Struktur entspricht exakt dem echten Dashboard:
 *   1. Range-Pills
 *   2. KPI-Grid (4 Cards)
 *   3. KPI-Grid (1 Card – CAGR)
 *   4. Abschnittslabel "Prognose"
 *   5. KPI-Grid (3 Cards – Prognose)
 *   6. Großer Chart-Block
 *   7. Heatmap-Block
 *   8. Tabellen-Block
 */
export default function SkeletonDashboard() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 12px' }}>

      {/* Seitenüberschrift */}
      <div style={{ marginBottom: 16 }}>
        <div className="skeleton" style={{ height: 22, width: 260, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 13, width: 180, borderRadius: 4, marginTop: 8 }} />
      </div>

      {/* Range-Pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[60, 48, 52].map((w, i) => (
          <div key={i} className="skeleton" style={{ height: 28, width: w, borderRadius: 20 }} />
        ))}
      </div>

      {/* KPI-Grid: 4 Cards */}
      <div className="kpi-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* KPI-Grid: 1 Card (CAGR) */}
      <div className="kpi-grid">
        <SkeletonCard />
      </div>

      {/* Prognose-Label */}
      <div className="skeleton" style={{ height: 11, width: 160, borderRadius: 4, marginBottom: 10 }} />

      {/* KPI-Grid: 3 Prognose-Cards */}
      <div className="kpi-grid">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Chart-Block */}
      <div style={{
        background: '#161b27',
        border: '1px solid #1e2a3a',
        borderRadius: 14,
        padding: '18px 16px',
        marginBottom: 20,
      }}>
        {/* Chart-Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 8 }} />
            <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 8 }} />
          </div>
          <div className="skeleton" style={{ height: 28, width: 60, borderRadius: 8 }} />
        </div>
        {/* Chart-Fläche */}
        <div className="skeleton" style={{ height: 220, width: '100%', borderRadius: 10 }} />
        {/* Legende */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
          {[90, 110, 80].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 10, width: w, borderRadius: 4 }} />
          ))}
        </div>
      </div>

      {/* Heatmap-Block */}
      <div style={{
        background: '#161b27',
        border: '1px solid #1e2a3a',
        borderRadius: 14,
        padding: '18px 16px',
        marginBottom: 20,
      }}>
        <div className="skeleton" style={{ height: 16, width: 180, borderRadius: 5, marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 90, width: '100%', borderRadius: 8 }} />
      </div>

      {/* Positions-Tabelle */}
      <div style={{
        background: '#161b27',
        border: '1px solid #1e2a3a',
        borderRadius: 14,
        padding: '18px 16px',
      }}>
        {/* Tabellen-Header */}
        <div className="skeleton" style={{ height: 16, width: 200, borderRadius: 5, marginBottom: 16 }} />
        {/* Spalten-Header */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {[120, 80, 90, 80, 80].map((w, i) => (
            <div key={i} className="skeleton" style={{ height: 11, width: w, borderRadius: 4 }} />
          ))}
        </div>
        {/* Zeilen */}
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'center',
            padding: '10px 0',
            borderTop: '1px solid #111827',
          }}>
            {[120, 80, 90, 80, 80].map((w, j) => (
              <div
                key={j}
                className="skeleton"
                style={{ height: 13, width: w, borderRadius: 4, opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
        ))}
      </div>

    </div>
  )
}
