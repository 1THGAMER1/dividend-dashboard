import KpiCard from './KpiCard'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function PortfolioDashboard({ 
  currentValue = 0, 
  forecast12m, 
  holdings = [],
  byHolding = {} 
}) {
  let list = []

  // 1. Echte Holdings aus Parqet verarbeiten (inkl. Growth, ETFs & Crypto)
  if (Array.isArray(holdings) && holdings.length > 0) {
    list = holdings
      .filter(Boolean)
      .map(h => {
        // Name auflösen (asset.name > name > isin)
        const name = h?.asset?.name || h?.name || h?.holdingName || h?.isin || 'Unbekannt'
        const isin = h?.asset?.isin || h?.isin || ''
        const type = h?.asset?.type || h?.type || 'Wertpapier'

        // Zahlen-Parser (unterstützt '0.83' als String und Floats)
        const shares = parseFloat(String(h?.shares ?? h?.amount ?? 0).replace(',', '.')) || 0
        const price = parseFloat(String(h?.price ?? h?.currentPrice ?? 0).replace(',', '.')) || 0
        
        // Marktwert auflösen
        const rawVal = h?.value ?? h?.marketValue ?? h?.totalValue ?? (shares * price)
        const value = parseFloat(String(rawVal).replace(',', '.')) || 0

        return { name, isin, type, shares, value }
      })
  } else if (byHolding && typeof byHolding === 'object') {
    // 2. Fallback über byHolding
    list = Object.entries(byHolding)
      .filter(([_, data]) => Boolean(data))
      .map(([key, data]) => {
        const name = data?.name || data?.asset?.name || key
        const isin = data?.isin || key
        const type = data?.type || 'Wertpapier'
        const shares = parseFloat(String(data?.shares || '0').replace(',', '.')) || 0
        const value = parseFloat(String(data?.value || data?.totalValue || 0).replace(',', '.')) || 0

        return { name, isin, type, shares, value }
      })
  }

  // Absteigend nach Marktwert sortieren
  list.sort((a, b) => b.value - a.value)

  const computedTotal = list.reduce((sum, item) => sum + item.value, 0)
  const finalTotalValue = currentValue > 0 ? currentValue : computedTotal

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI KARTEN */}
      <div className="kpi-grid">
        <KpiCard
          label="Portfolio Marktwert"
          value={finalTotalValue > 0 ? fmt(finalTotalValue) : '--- €'}
          color="#60a5fa"
          sub="Aktueller Gesamtwert aller Assets"
        />
        <KpiCard
          label="Anzahl Positionen"
          value={list.length.toString()}
          color="#a78bfa"
          sub="Alle Assets im Depot (inkl. Growth & Crypto)"
        />
        <KpiCard
          label="Progn. Jahresausschüttung"
          value={fmt(forecast12m?.total ?? 0)}
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
              <th style={{ paddingBottom: 10 }}>Asset</th>
              <th style={{ paddingBottom: 10 }}>Typ</th>
              <th style={{ paddingBottom: 10 }}>Anteile</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Anteil am Depot</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Marktwert</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                  Keine Bestände im Depot gefunden.
                </td>
              </tr>
            ) : (
              list.map((item, idx) => {
                const sharePct = finalTotalValue > 0 && item.value > 0 
                  ? ((item.value / finalTotalValue) * 100).toFixed(1) 
                  : '—'

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #0f1420' }}>
                    <td style={{ padding: '12px 0', fontWeight: 500, color: '#e2e8f0' }}>
                      <div>{item.name}</div>
                      {item.isin && item.isin !== item.name && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>{item.isin}</div>
                      )}
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
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 0', color: '#94a3b8' }}>
                      {item.shares > 0 ? item.shares.toLocaleString('de-DE') : '—'}
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right', color: '#94a3b8' }}>
                      {sharePct !== '—' ? `${sharePct} %` : '—'}
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
