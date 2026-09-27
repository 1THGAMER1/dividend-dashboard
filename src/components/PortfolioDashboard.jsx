import KpiCard from './KpiCard'

// 1. FIX: Robuste Formatierung mit Tausendertrennzeichen über Intl.NumberFormat
const fmt = n => 
  new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR' 
  }).format(n || 0)

export default function PortfolioDashboard({ 
  currentValue,
  currentVal, // 2. FIX: Fallback hinzugefügt, da die API "currentVal" liefert
  forecast12m, 
  holdings = [] 
}) {
  // Nimmt currentValue, fällt aber sicher auf currentVal der API zurück
  const displayValue = currentValue ?? currentVal ?? 0;

  // 3. FIX: Sichere Fallbacks (?? 0) für "shares", falls das Feld im Objekt fehlt
  const activeHoldings = holdings
    .filter(item => (item.shares ?? 0) > 0.001)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const soldHoldings = holdings
    .filter(item => (item.shares ?? 0) <= 0.001)
    // 4. FIX: Absturzschutz bei fehlendem Namen im String-Vergleich
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* KPI KARTEN */}
      <div className="kpi-grid">
        <KpiCard
          label="Portfolio Marktwert"
          value={displayValue > 0 ? fmt(displayValue) : '--- €'}
          color="#60a5fa"
          sub="Aktueller Gesamtwert"
        />
        <KpiCard
          label="Aktive Positionen"
          value={activeHoldings.length.toString()}
          color="#a78bfa"
          sub="Alle Assets im Depot (inkl. Krypto)"
        />
        <KpiCard
          label="Progn. Jahresausschüttung"
          // 5. FIX: "net" statt "total" verwendet, passend zur Datenstruktur kpi12m
          value={fmt(forecast12m?.net ?? 0)}
          color="#22c55e"
          sub="Nächste 12 Monate Netto"
        />
      </div>

      {/* 1. TABELLE: AKTIVE BESTÄNDE */}
      <div style={{ background: '#161b27', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, overflowX: 'auto' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#f1f5f9' }}>
          💼 Aktive Bestände
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
              <th style={{ paddingBottom: 10 }}>Asset</th>
              <th style={{ paddingBottom: 10 }}>Typ</th>
              <th style={{ paddingBottom: 10 }}>Anteile</th>
              <th style={{ paddingBottom: 10, textAlign: 'right' }}>Einstandswert</th>
            </tr>
          </thead>
          <tbody>
            {activeHoldings.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                  Keine aktiven Bestände gefunden.
                </td>
              </tr>
            ) : (
              activeHoldings.map((item, idx) => (
                // 6. FIX: Stabile React-Keys (ISIN oder Ticker) statt reinem Array-Index
                <tr key={item.isin || item.ticker || idx} style={{ borderBottom: '1px solid #0f1420' }}>
                  <td style={{ padding: '12px 0', fontWeight: 500, color: '#e2e8f0' }}>
                    <div>{item.name || 'Unbekanntes Asset'}</div>
                    {item.isin && <div style={{ fontSize: 11, color: '#64748b' }}>{item.isin}</div>}
                  </td>
                  <td style={{ padding: '12px 0' }}>
                    <span style={{ background: '#0f172a', border: '1px solid #1e293b', color: '#38bdf8', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                      {item.type || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 0', color: '#94a3b8' }}>
                    {item.shares > 0 ? item.shares.toLocaleString('de-DE') : '—'}
                  </td>
                  <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#f1f5f9' }}>
                    {(item.value ?? 0) > 0 ? fmt(item.value) : '---'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 2. TABELLE: VERKAUFTE POSITIONEN */}
      {soldHoldings.length > 0 && (
        <div style={{ background: '#0f1420', border: '1px solid #1e2a3a', borderRadius: 16, padding: 20, overflowX: 'auto', opacity: 0.8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#94a3b8' }}>
            📦 Verkaufte & Historische Positionen
          </h3>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e2a3a', color: '#64748b', fontSize: 12 }}>
                <th style={{ paddingBottom: 10 }}>Asset</th>
                <th style={{ paddingBottom: 10 }}>Typ</th>
                <th style={{ paddingBottom: 10, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {soldHoldings.map((item, idx) => (
                <tr key={item.isin || item.ticker || idx} style={{ borderBottom: '1px solid #161b27' }}>
                  <td style={{ padding: '10px 0', fontWeight: 500, color: '#94a3b8' }}>
                    <div>{item.name || 'Unbekanntes Asset'}</div>
                    {item.isin && <div style={{ fontSize: 11, color: '#556070' }}>{item.isin}</div>}
                  </td>
                  <td style={{ padding: '10px 0' }}>
                    <span style={{ background: '#161b27', border: '1px solid #1e2a3a', color: '#64748b', fontSize: 11, padding: '2px 8px', borderRadius: 10 }}>
                      {item.type || 'N/A'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', color: '#64748b', fontStyle: 'italic' }}>
                    Verkauft (0 Anteile)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
