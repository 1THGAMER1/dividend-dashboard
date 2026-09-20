import KpiCard from './KpiCard'
import DividendDonut from './DividendDonut'
import PositionsTable from './PositionsTable'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

export default function PortfolioDashboard({ 
  currentValue, 
  forecast12m, 
  calcForecastNext12mNet, 
  byHolding, 
  kpiRange 
}) {
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
          label="Progn. Jahresausschüttung"
          value={fmt(forecast12m.total)}
          color="#22c55e"
          sub="Nächste 12 Monate Netto"
        />
        <KpiCard
          label="Dividendenrendite (Marktwert)"
          value={currentValue > 0 ? fmtPct((calcForecastNext12mNet() / currentValue) * 100) : '--- %'}
          color="#34d399"
          sub="Erwartete Rendite"
        />
      </div>

      {/* Positionen & Holdings */}
      <div style={{ marginTop: 10 }}>
        <DividendDonut byHolding={byHolding} kpiRange={kpiRange} />
        <PositionsTable byHolding={byHolding} kpiRange={kpiRange} />
      </div>
    </div>
  )
}
