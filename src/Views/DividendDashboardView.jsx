import React from 'react'
import KpiCard from '../components/KpiCard.jsx'
import DividendChart from '../components/DividendChart.jsx'
import DividendHeatmap from '../components/DividendHeatmap.jsx'
import PositionsTable from '../components/PositionsTable.jsx'
import DividendDonut from '../components/DividendDonut.jsx'
import SkeletonDashboard from '../components/SkeletonDashboard.jsx'
import EmptyState from '../components/EmptyState.jsx'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
    { key: 'all', label: 'Gesamt' },
    { key: 'ytd', label: 'YTD'   },
    { key: '12m', label: '12M'   },
]

export default function DividendDashboardView({
                                                  showSkeleton,
                                                  showEmpty,
                                                  loadData,
                                                  loading,
                                                  error,
                                                  kpiRange,
                                                  setKpiRange,
                                                  k,
                                                  dividendYield,
                                                  trueCagr,
                                                  yoy,
                                                  hasRealData,
                                                  realTotal,
                                                  inflation,
                                                  forecast12m,
                                                  cy,
                                                  forecastMonthly,
                                                  monthly,
                                                  cum,
                                                  forecastCum,
                                                  byHolding,
                                                  forecastByHolding,
                                                  currentValue,
                                                  yearTotal
                                              }) {
    if (showSkeleton) return <SkeletonDashboard />
    if (showEmpty)    return <EmptyState onRefresh={loadData} loading={loading} error={error} />

    const calcForecastNext12mNet = () => {
        let total = 0
        const cm = new Date().getMonth()
        for (let i = 0; i < 12; i++) {
            const futureMonth = (cm + 1 + i) % 12
            const futureYear  = cy + Math.floor((cm + 1 + i) / 12)
            total += forecastMonthly?.[futureYear]?.[futureMonth] ?? 0
        }
        return +total.toFixed(2)
    }

    return (
        <div>
            <div style={{ marginBottom: 14 }}>
                <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>📈 Dividenden Dashboard</h1>
                <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Portfolio-Übersicht · Nettowerte</p>
            </div>

            {error && (
                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                    ⚠ {error}
                </div>
            )}

            <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                {KPI_RANGES.map(({ key, label }) => (
                    <button key={key} onClick={() => setKpiRange(key)} style={{
                        padding:'4px 14px', borderRadius:20, fontSize:11, cursor:'pointer',
                        border:'1px solid #2a3a50',
                        background: kpiRange === key ? '#1e3a5f' : 'transparent',
                        color: kpiRange === key ? '#93c5fd' : '#7a8ba0',
                    }}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="kpi-grid">
                <KpiCard label="Dividenden Netto" value={k.net} color="#22c55e" detail={{ label:'Ø Monatlich', value:k.avg, color:'#a78bfa' }} />
                <KpiCard label="Brutto" value={k.gross} color="#60a5fa" detail={{ label:'davon Steuern', value:k.tax, color:'#fb923c' }} />
                <KpiCard label="Dividendenrendite" value={fmtPct((dividendYield[kpiRange] ?? 0) + 0.01)} color="#34d399" sub="auf den Einstandskurs" />
            </div>

            <div className="kpi-grid">
                {trueCagr !== null && (
                    <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to}`} />
                )}
                <KpiCard label="YoY-Wachstum" value={yoy === null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy === null ? 'Nicht genügend Daten' : '12M vs. Vorjahr'} />
                {hasRealData && (
                    <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Verlust', value: fmt(inflation), color: '#ef4444' }} sub={`Basis: ${Object.keys(monthly || {}).map(Number).sort()[0]}`} />
                )}
            </div>

            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
            <div className="kpi-grid">
                <KpiCard label="Voraussichtlich Netto" value={fmt(forecast12m.total)} color="#f472b6" detail={{ label:'Ø Monatlich', value:fmt(forecast12m.avg), color:'#f472b6' }} sub="Basierend auf Vorjahren" />
                <KpiCard
                    label={`Wachstum ${cy} vs. ${cy - 1}`}
                    value={(() => {
                        const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0);
                        const actualLastYear = yearTotal(monthly, cy - 1);
                        if (actualLastYear === 0) return '–';
                        const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100;
                        return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %';
                    })()}
                    color={(() => {
                        const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0);
                        const actualLastYear = yearTotal(monthly, cy - 1);
                        if (actualLastYear === 0) return '#7a8ba0';
                        return ((forecastCurrentYear - actualLastYear) / actualLastYear) >= 0 ? '#22c55e' : '#ef4444';
                    })()}
                    sub="Prognose Gesamtjahr"
                />
                <KpiCard
                    label="Progn. Dividendenrendite"
                    value={(() => {
                        const forecastNet = calcForecastNext12mNet();
                        if (!currentValue || currentValue === 0) return '–';
                        return fmtPct((forecastNet / currentValue) * 100);
                    })()}
                    color="#5bcec2"
                    sub="Nächste 12M / Marktwert"
                />
            </div>

            <div style={{ marginTop: 16 }}>
                <DividendChart monthly={monthly} cum={cum} forecastCum={forecastCum} forecastMonthly={forecastMonthly} byHolding={byHolding} forecastByHolding={forecastByHolding} />
            </div>
            <div style={{ marginTop: 16 }}>
                <DividendHeatmap monthly={monthly} />
            </div>

            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DividendDonut byHolding={byHolding} kpiRange={kpiRange} />
                <PositionsTable byHolding={byHolding} kpiRange={kpiRange} />
            </div>
        </div>
    )
}