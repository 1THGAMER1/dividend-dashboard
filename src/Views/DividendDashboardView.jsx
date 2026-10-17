import React, { useMemo } from 'react'
import KpiCard from '../components/KpiCard.jsx'
import DividendChart from '../components/DividendChart.jsx'
import CumulativeDividendChart from '../components/CumulativeDividendChart.jsx'
import DividendHeatmap from '../components/DividendHeatmap.jsx'
import PositionsTable from '../components/PositionsTable.jsx'
import DividendDonut from '../components/DividendDonut.jsx'
import SkeletonDashboard from '../components/SkeletonDashboard.jsx'
import EmptyStateView from './EmptyStateView.jsx'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
    { key: 'all', label: 'Gesamt' },
    { key: 'ytd', label: 'YTD'   },
    { key: '12m', label: '12M'   },
    { key: '3y',  label: '3J'    },
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
    if (showEmpty)    return <EmptyStateView onRefresh={loadData} loading={loading} error={error} />

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

    // ── 3-Jahres-Berechnung (oder Fallback auf k) ─────────────────────────────
    const activeK = useMemo(() => {
        if (kpiRange === '3y') {
            const cm = new Date().getMonth()
            let net = 0
            let gross = 0
            let tax = 0

            for (let i = 0; i < 36; i++) {
                const targetDate = new Date(cy, cm - i, 1)
                const y = targetDate.getFullYear()
                const m = targetDate.getMonth()

                if (byHolding && Object.keys(byHolding).length > 0) {
                    Object.values(byHolding).forEach(h => {
                        const n = h.monthly?.[y]?.[m] || 0
                        const g = h.gross?.[y]?.[m] || n
                        const t = h.tax?.[y]?.[m] || (g - n)
                        net += n
                        gross += g
                        tax += t
                    })
                } else if (monthly?.[y]?.[m] !== undefined) {
                    const n = monthly[y][m] || 0
                    net += n
                    gross += n
                }
            }

            const avg = net / 36

            return {
                net: fmt(net),
                gross: fmt(gross),
                tax: fmt(tax),
                avg: fmt(avg),
                rawNet: net,
            }
        }

        return k || { net: '0,00 €', gross: '0,00 €', tax: '0,00 €', avg: '0,00 €' }
    }, [kpiRange, k, byHolding, monthly, cy])

    const activeYield = useMemo(() => {
        if (kpiRange === '3y') {
            if (activeK.rawNet && currentValue > 0) {
                const annualNet = activeK.rawNet / 3
                return fmtPct((annualNet / currentValue) * 100)
            }
            return '–'
        }
        return fmtPct((dividendYield?.[kpiRange] ?? 0) + 0.01)
    }, [kpiRange, dividendYield, activeK, currentValue])

    // Für 3J filtern wir byHolding auf die letzten 36 Monate, damit auch Donut & Tabelle exakt 3J anzeigen
    const filteredByHolding = useMemo(() => {
        if (kpiRange !== '3y' || !byHolding) return byHolding
        const cm = new Date().getMonth()
        const res = {}

        Object.entries(byHolding).forEach(([isin, h]) => {
            const newMonthly = {}
            const newGross = {}
            const newTax = {}

            for (let i = 0; i < 36; i++) {
                const targetDate = new Date(cy, cm - i, 1)
                const y = targetDate.getFullYear()
                const m = targetDate.getMonth()

                if (h.monthly?.[y]?.[m] !== undefined) {
                    if (!newMonthly[y]) newMonthly[y] = Array(12).fill(0)
                    newMonthly[y][m] = h.monthly[y][m]
                }
                if (h.gross?.[y]?.[m] !== undefined) {
                    if (!newGross[y]) newGross[y] = Array(12).fill(0)
                    newGross[y][m] = h.gross[y][m]
                }
                if (h.tax?.[y]?.[m] !== undefined) {
                    if (!newTax[y]) newTax[y] = Array(12).fill(0)
                    newTax[y][m] = h.tax[y][m]
                }
            }

            res[isin] = {
                ...h,
                monthly: newMonthly,
                gross: newGross,
                tax: newTax,
            }
        })
        return res
    }, [byHolding, kpiRange, cy])

    const currentRangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'

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

            {/* ZEITRAUM-SCHALTER */}
            <div style={{
                display: 'inline-flex',
                gap: 4,
                marginBottom: 14,
                background: '#0f1420',
                padding: 3,
                borderRadius: 22,
                border: '1px solid #1e2a3a',
                flexWrap: 'wrap'
            }}>
                {KPI_RANGES.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setKpiRange(key)}
                        style={{
                            padding: '4px 14px',
                            borderRadius: 18,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none',
                            background: kpiRange === key ? '#009991' : 'transparent',
                            color: kpiRange === key ? '#ffffff' : '#7a8ba0',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* 1. KPI-REIHE (HISTORISCH NACH ZEITRAUM) */}
            <div className="kpi-grid">
                <KpiCard
                    label={`Dividenden Netto (${currentRangeLabel})`}
                    value={activeK.net}
                    color="#22c55e"
                    detail={{ label: 'Ø Monatlich', value: activeK.avg, color: '#a78bfa' }}
                />
                <KpiCard
                    label="Brutto"
                    value={activeK.gross}
                    color="#60a5fa"
                    detail={{ label: 'davon Steuern', value: activeK.tax, color: '#fb923c' }}
                />
                <KpiCard
                    label="Dividendenrendite"
                    value={activeYield}
                    color="#34d399"
                    sub={kpiRange === '3y' ? '3J Ø / Marktwert' : 'auf den Einstandskurs'}
                />
            </div>

            {/* 2. KPI-REIHE (WACHSTUM & REAL) */}
            <div className="kpi-grid">
                {trueCagr !== null && (
                    <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to}`} />
                )}
                <KpiCard label="YoY-Wachstum" value={yoy === null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy === null ? 'Nicht genügend Daten' : '12M vs. Vorjahr'} />
                {hasRealData && (
                    <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Verlust', value: fmt(inflation), color: '#ef4444' }} sub={`Basis: ${Object.keys(monthly || {}).map(Number).sort()[0]}`} />
                )}
            </div>

            {/* 3. KPI-REIHE (PROGNOSE NÄCHSTE 12M) */}
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

            {/* 2 CHARTS: NEBENEINANDER AUF PC (50/50), UNTEREINANDER AUF MOBILE */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
                gap: 16,
                marginTop: 16,
                alignItems: 'stretch'
            }}>
                <DividendChart
                    monthly={monthly}
                    forecastMonthly={forecastMonthly}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                />
                <CumulativeDividendChart
                    monthly={monthly}
                    cum={cum}
                    forecastCum={forecastCum}
                    byHolding={byHolding}
                />
            </div>

            {/* HEATMAP */}
            <div style={{ marginTop: 16 }}>
                <DividendHeatmap monthly={monthly} />
            </div>

            {/* DONUT & TABELLE */}
            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DividendDonut byHolding={filteredByHolding} kpiRange={kpiRange} />
                <PositionsTable byHolding={filteredByHolding} kpiRange={kpiRange} />
            </div>
        </div>
    )
}