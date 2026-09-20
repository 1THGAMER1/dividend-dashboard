import KpiCard from './KpiCard'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

export default function PortfolioDashboard({ 
  currentValue, 
  forecast12m, 
  byHolding 
}) {
  // Holdings aus byHolding extrahieren und vorhandene Kennzahlen mappen
  const holdingsList = Object.entries(byHolding || {}).map(([key, data]) => {
    const sharesNum = parseFloat(String(data.shares || '0').replace(',', '.')) || 0
    const netValue = parseFloat(String(data.net || '0')) || 0
    const yieldVal = parseFloat(String(data.yield || '0')) || 0

    return {
      name: data.name || data.asset?.name || key,
      type: data.type || 'Asset',
      shares: sharesNum,
      net: netValue,
      divYield: yieldVal,
    }
  }).sort((a, b) => b.net - a.net)

  const totalNetDiv = holdingsList.reduce((sum, h) => sum + h.net, 0)

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
          value={fmt(forecast12m?.total ?? totalNetDiv)}
          color="#22c55e"
          sub="Nächste 12 Monate Netto"
        />
      </div>

      {/* PORTFOLIO & ERTRAGS-TABELLE */}
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
          💼 Positionen & Ertragsübersicht
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
              <th style={{ paddingBottom: 10 }}>Holding</th>
              <th style={{ paddingBottom: 10 }}>Typ</th>
              <th style={{ paddingBottom: 10 }}>Anteile</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Div. Yield</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Netto Ertrag</th>
            </tr>
          </thead>
          <tbody>
            {holdingsList.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                  Keine Holdings gefunden.
                </td>
              </tr>
            ) : (
              holdingsList.map((item, idx) => (
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
                  <td style={{ padding: '12px 0', color: '#94a3b8' }}>
                    {item.shares > 0 ? item.shares.toLocaleString('de-DE') : '—'}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', color: '#34d399' }}>
                    {item.divYield > 0 ? fmtPct(item.divYield) : '—'}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                    {item.net > 0 ? fmt(item.net) : '—'}
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
