import KpiCard from './KpiCard'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function PortfolioDashboard({ 
  currentValue, 
  forecast12m, 
  calcForecastNext12mNet, 
  byHolding 
}) {
  // Holdings als Array aufbereiten & nach Marktwert / Wert sortieren
  const holdingsList = Object.entries(byHolding || {}).map(([name, data]) => ({
    name,
    type: data.type || 'Asset',
    shares: data.shares || 0,
    value: data.value || data.totalValue || 0,
    netDiv: data.net || 0,
  })).sort((a, b) => b.value - a.value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI KARTEN */}
      <div className="kpi-grid">
        <KpiCard
          label="Portfolio Marktwert"
          value={currentValue > 0 ? fmt(currentValue) : '--- €'}
          color="#60a5fa"
          sub="Aktueller Gesamtwert"
        />
        <KpiCard
          label="Anzahl Positionen"
          value={holdingsList.length.toString()}
          color="#a78bfa"
          sub="Aktive Holdings im Depot"
        />
        <KpiCard
          label="Progn. Jahresausschüttung"
          value={fmt(forecast12m.total)}
          color="#22c55e"
          sub="Nächste 12 Monate Netto"
        />
      </div>

      {/* PORTFOLIO POSITIONEN TABELLE */}
      <div
        style={{
          background: '#161b27',
          border: '1px solid #1e2a3a',
          borderRadius: 16,
          padding: 20,
          overflowX: 'auto',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
          💼 Portfolio Bestände & Gewichtung
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
              <th style={{ paddingBottom: 10 }}>Holding</th>
              <th style={{ paddingBottom: 10 }}>Typ</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Anteil am Depot</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Marktwert</th>
            </tr>
          </thead>
          <tbody>
            {holdingsList.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                  Keine Holdings gefunden.
                </td>
              </tr>
            ) : (
              holdingsList.map((item, idx) => {
                const sharePct = currentValue > 0 ? ((item.value / currentValue) * 100).toFixed(1) : 0

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #0f1420' }}>
                    <td style={{ padding: '12px 0', fontWeight: 500, color: '#e2e8f0' }}>
                      {item.name}
                    </td>
                    <td style={{ padding: '12px 0' }}>
                      <span
                        style={{
                          background: '#0f172a',
                          border: '1px solid #1e293b',
                          color: '#38bdf8',
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 10,
                        }}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right', color: '#94a3b8' }}>
                      {sharePct} %
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                      {item.value > 0 ? fmt(item.value) : '---'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
