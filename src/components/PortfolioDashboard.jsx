import KpiCard from './KpiCard'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'

export default function PortfolioDashboard({ 
  currentValue, 
  forecast12m, 
  holdings = [],
  byHolding = {} 
}) {
  let list = []

  // 1. Primär: Echte Parqet Holdings verwenden (falls vorhanden)
  if (Array.isArray(holdings) && holdings.length > 0) {
    list = holdings
      .filter(Boolean)
      .map(h => {
        const shares = parseFloat(String(h?.shares || h?.amount || 0).replace(',', '.')) || 0
        const price = parseFloat(String(h?.price || h?.currentPrice || 0).replace(',', '.')) || 0
        const val = parseFloat(String(h?.value || h?.marketValue || (shares * price)).replace(',', '.')) || 0

        return {
          name: h?.asset?.name || h?.name || h?.isin || 'Unbekannt',
          isin: h?.asset?.isin || h?.isin || '',
          type: h?.asset?.type || h?.type || 'Wertpapier',
          shares: shares,
          value: val,
        }
      })
  } else if (byHolding && typeof byHolding === 'object') {
    // 2. Fallback: byHolding
    list = Object.entries(byHolding)
      .filter(([_, data]) => Boolean(data))
      .map(([key, data]) => {
        const sharesNum = parseFloat(String(data?.shares || '0').replace(',', '.')) || 0
        const val = parseFloat(String(data?.value || data?.totalValue || 0).replace(',', '.')) || 0

        return {
          name: data?.name || data?.asset?.name || key,
          isin: data?.isin || key,
          type: data?.type || 'Wertpapier',
          shares: sharesNum,
          value: val,
        }
      })
  }

  // Sicheres Sortieren absteigend nach Wert
  list.sort((a, b) => (b?.value || 0) - (a?.value || 0))

  const computedTotalValue = list.reduce((sum, item) => sum + (item?.value || 0), 0)
  const finalTotalValue = currentValue > 0 ? currentValue : computedTotalValue

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
