import KpiCard from './KpiCard'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function PortfolioDashboard({ 
  currentValue, 
  forecast12m, 
  holdings = [] 
}) {
  // Sicherstellen, dass das Array gültig ist und absteigend nach Einstandswert sortieren
  const list = [...holdings].sort((a, b) => (b.value || 0) - (a.value || 0))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="kpi-grid">
        <KpiCard
          label="Portfolio Marktwert"
          value={currentValue > 0 ? fmt(currentValue) : '--- €'}
          color="#60a5fa"
          sub="Aktueller Gesamtwert"
        />
        <KpiCard
          label="Anzahl Positionen"
          value={list.length.toString()}
          color="#a78bfa"
          sub="Alle Assets (inkl. Growth & Krypto)"
        />
        <KpiCard
          label="Progn. Jahresausschüttung"
          value={fmt(forecast12m?.total ?? 0)}
          color="#22c55e"
          sub="Nächste 12 Monate Netto"
        />
      </div>

      <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, overflowX: 'auto' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
          💼 Portfolio Bestände
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
              <th style={{ paddingBottom: 10 }}>Asset</th>
              <th style={{ paddingBottom: 10 }}>Typ</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Einstandswert</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                  Keine Bestände gefunden.
                </td>
              </tr>
            ) : (
              list.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #0f1420' }}>
                  <td style={{ padding: '12px 0', fontWeight: 500, color: '#e2e8f0' }}>
                    <div>{item.name}</div>
                    {item.isin && <div style={{ fontSize: 11, color: '#64748b' }}>{item.isin}</div>}
                  </td>
                  <td style={{ padding: '12px 0' }}>
                    <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#38bdf8', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                      {item.type}
                    </span>
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                    {item.value > 0 ? fmt(item.value) : '---'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
