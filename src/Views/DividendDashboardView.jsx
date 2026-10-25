import React, { useMemo, useState, useEffect } from 'react'
import KpiCard from '../components/KpiCard.jsx'
import DividendChart from '../components/DividendChart.jsx'
import CumulativeDividendChart from '../components/CumulativeDividendChart.jsx'
import DividendHeatmap from '../components/DividendHeatmap.jsx'
import PositionsTable from '../components/PositionsTable.jsx'
import DividendDonut from '../components/DividendDonut.jsx'
import SkeletonDashboard from '../components/SkeletonDashboard.jsx'
import EmptyStateView from './EmptyStateView.jsx'
import { fetchAllDbActivities } from '../utils/manualActivities'

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
                                                  loadData,
                                                  loading: parqetLoading,
                                                  error,
                                                  kpiRange,
                                                  setKpiRange,
                                                  k: propK,
                                                  dividendYield: propDividendYield,
                                                  trueCagr,
                                                  yoy: propYoy,
                                                  hasRealData,
                                                  realTotal,
                                                  inflation,
                                                  forecast12m: propForecast12m,
                                                  cy = new Date().getFullYear(),
                                                  forecastMonthly: propForecastMonthly,
                                                  monthly: propMonthly,
                                                  cum: propCum,
                                                  forecastCum: propForecastCum,
                                                  byHolding: propByHolding,
                                                  forecastByHolding: propForecastByHolding,
                                                  currentValue: propCurrentValue = 0,
                                                  yearTotal,
                                              }) {
    const cm = new Date().getMonth() // 0-11

    // ── 1. SUPABASE-DATEN LADEN ──────────────────────────────────────────────
    const [dbActivities, setDbActivities] = useState([])
    const [dbLoading, setDbLoading] = useState(true)

    const loadFromDb = async () => {
        setDbLoading(true)
        try {
            const data = await fetchAllDbActivities()
            setDbActivities(data || [])
        } catch (err) {
            console.warn('Fehler beim Laden der Supabase-Aktivitäten:', err)
        } finally {
            setDbLoading(false)
        }
    }

    useEffect(() => {
        loadFromDb()
    }, [])

    const handleRefreshAll = async () => {
        await loadFromDb()
        if (loadData) await loadData()
    }

    // ── 2. DATEN SYNTHESE ───────────────────────────────────────────────────
    const {
        effectiveMonthly,
        effectiveByHolding,
        effectiveCum,
        effectiveForecastMonthly,
        effectiveForecastCum,
        effectiveForecastByHolding,
        hasAnyData,
        firstActiveDate,
        inferredInvestedCapital
    } = useMemo(() => {
        const hasPropMonthly = Boolean(propMonthly && Object.keys(propMonthly).length > 0)

        if (hasPropMonthly) {
            return {
                effectiveMonthly: propMonthly,
                effectiveByHolding: propByHolding || {},
                effectiveCum: propCum || {},
                effectiveForecastMonthly: propForecastMonthly || {},
                effectiveForecastCum: propForecastCum || {},
                effectiveForecastByHolding: propForecastByHolding || {},
                hasAnyData: true,
                firstActiveDate: null,
                inferredInvestedCapital: propCurrentValue
            }
        }

        const synthM = {}
        const synthH = {}
        const synthC = {}
        let divCount = 0
        let earliestDate = null
        let invested = 0

        if (Array.isArray(dbActivities) && dbActivities.length > 0) {
            dbActivities.forEach(a => {
                const type = String(a.type || '').toLowerCase()
                const d = new Date(a.date || a.datetime || 0)
                const isValidDate = !isNaN(d.getTime())

                if (type === 'buy') {
                    invested += Number(a.amount || 0)
                } else if (type === 'sell') {
                    invested = Math.max(0, invested - Number(a.amount || 0))
                }

                if (type !== 'dividend') return

                divCount++
                if (isValidDate) {
                    if (!earliestDate || d < earliestDate) earliestDate = d
                }

                const y = d.getFullYear()
                const m = d.getMonth()
                const net = Number(a.amountNet ?? a.amount ?? 0)
                const tax = Number(a.tax ?? 0)
                const fee = Number(a.fee ?? 0)
                const gross = (Number(a.gross) > net) ? Number(a.gross) : (net + tax + fee)
                const key = a.isin || a.name || 'Unbekannt'

                if (!synthM[y]) synthM[y] = Array(12).fill(0)
                synthM[y][m] = +(synthM[y][m] + net).toFixed(2)

                if (!synthH[key]) {
                    synthH[key] = {
                        name: a.name || key,
                        isin: a.isin || key,
                        assetType: a.assetType || 'Security',
                        totalNet: 0,
                        monthly: {},
                        gross: {},
                        tax: {}
                    }
                }
                if (!synthH[key].monthly[y]) synthH[key].monthly[y] = Array(12).fill(0)
                if (!synthH[key].gross[y])   synthH[key].gross[y] = Array(12).fill(0)
                if (!synthH[key].tax[y])     synthH[key].tax[y] = Array(12).fill(0)

                synthH[key].monthly[y][m] = +(synthH[key].monthly[y][m] + net).toFixed(2)
                synthH[key].gross[y][m]   = +(synthH[key].gross[y][m] + gross).toFixed(2)
                synthH[key].tax[y][m]     = +(synthH[key].tax[y][m] + tax).toFixed(2)
                synthH[key].totalNet      = +(synthH[key].totalNet + net).toFixed(2)
            })

            Object.keys(synthM).forEach(y => {
                synthC[y] = Array(12).fill(0)
                let running = 0
                for (let i = 0; i < 12; i++) {
                    running += (synthM[y][i] || 0)
                    synthC[y][i] = +running.toFixed(2)
                }
            })
        }

        // Auto-Prognose
        const synthForecastM = {}
        const synthForecastC = {}
        const synthForecastH = {}

        const prevYearArr = synthM[cy - 1] || Array(12).fill(0)

        ;[cy, cy + 1].forEach(targetY => {
            synthForecastM[targetY] = Array(12).fill(0)
            synthForecastC[targetY] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) {
                let expVal = 0
                if (targetY === cy) {
                    expVal = i <= cm ? (synthM[cy]?.[i] || 0) : (prevYearArr[i] || 0)
                } else {
                    expVal = (synthM[cy]?.[i] || 0) > 0 ? synthM[cy][i] : (prevYearArr[i] || 0)
                }
                synthForecastM[targetY][i] = expVal
                running += expVal
                synthForecastC[targetY][i] = +running.toFixed(2)
            }
        })

        return {
            effectiveMonthly: synthM,
            effectiveByHolding: synthH,
            effectiveCum: synthC,
            effectiveForecastMonthly: propForecastMonthly && Object.keys(propForecastMonthly).length > 0 ? propForecastMonthly : synthForecastM,
            effectiveForecastCum: propForecastCum && Object.keys(propForecastCum).length > 0 ? propForecastCum : synthForecastC,
            effectiveForecastByHolding: propForecastByHolding && Object.keys(propForecastByHolding).length > 0 ? propForecastByHolding : synthForecastH,
            hasAnyData: divCount > 0,
            firstActiveDate: earliestDate,
            inferredInvestedCapital: invested > 0 ? invested : propCurrentValue
        }
    }, [propMonthly, propByHolding, propCum, propForecastMonthly, propForecastCum, propForecastByHolding, propCurrentValue, dbActivities, cy, cm])

    // ── 3. ZEITRAUM-FILTER ───────────────────────────────────────────────────
    const { filteredByHolding, filteredMonthlyForHeatmap, rangeTotals, monthsActive } = useMemo(() => {
        let net = 0
        let gross = 0
        let tax = 0

        const isInRange = (y, m) => {
            if (kpiRange === 'all') return true
            if (kpiRange === 'ytd') return y === cy && m <= cm
            if (kpiRange === '12m') {
                const diff = (cy - y) * 12 + (cm - m)
                return diff >= 0 && diff < 12
            }
            if (kpiRange === '3y') {
                const diff = (cy - y) * 12 + (cm - m)
                return diff >= 0 && diff < 36
            }
            return true
        }

        const resByHolding = {}
        Object.entries(effectiveByHolding || {}).forEach(([isin, h]) => {
            const newM = {}
            const newG = {}
            const newT = {}

            Object.keys(h.monthly || {}).forEach(yStr => {
                const y = Number(yStr)
                for (let m = 0; m < 12; m++) {
                    if (isInRange(y, m)) {
                        const nVal = h.monthly?.[y]?.[m] || 0
                        const gVal = h.gross?.[y]?.[m] || nVal
                        const tVal = h.tax?.[y]?.[m] || 0

                        if (!newM[y]) newM[y] = Array(12).fill(0)
                        if (!newG[y]) newG[y] = Array(12).fill(0)
                        if (!newT[y]) newT[y] = Array(12).fill(0)

                        newM[y][m] = nVal
                        newG[y][m] = gVal
                        newT[y][m] = tVal
                    }
                }
            })

            resByHolding[isin] = {
                ...h,
                monthly: newM,
                gross: newG,
                tax: newT,
            }
        })

        const resMonthly = {}
        Object.keys(effectiveMonthly || {}).forEach(yStr => {
            const y = Number(yStr)
            for (let m = 0; m < 12; m++) {
                if (isInRange(y, m)) {
                    const val = effectiveMonthly?.[y]?.[m] || 0
                    if (!resMonthly[y]) resMonthly[y] = Array(12).fill(0)
                    resMonthly[y][m] = val
                    net += val

                    Object.values(effectiveByHolding || {}).forEach(h => {
                        gross += (h.gross?.[y]?.[m] || 0)
                        tax += (h.tax?.[y]?.[m] || 0)
                    })
                }
            }
        })

        // Berechne die reale Anzahl der aktiven Monate
        let activeMonthsCount = 1
        if (kpiRange === 'ytd') {
            activeMonthsCount = cm + 1
        } else if (kpiRange === '12m') {
            activeMonthsCount = 12
        } else if (kpiRange === '3y') {
            activeMonthsCount = 36
        } else {
            // Gesamt: Monate seit erster Dividende
            if (firstActiveDate) {
                const fy = firstActiveDate.getFullYear()
                const fm = firstActiveDate.getMonth()
                activeMonthsCount = Math.max(1, (cy - fy) * 12 + (cm - fm) + 1)
            } else {
                const years = Object.keys(effectiveMonthly).map(Number).sort()
                activeMonthsCount = years.length > 0 ? Math.max(1, (cy - years[0]) * 12 + cm + 1) : 12
            }
        }

        const avg = net / activeMonthsCount

        return {
            filteredByHolding: resByHolding,
            filteredMonthlyForHeatmap: resMonthly,
            rangeTotals: {
                net,
                gross: gross > 0 ? gross : (net + tax),
                tax,
                avg
            },
            monthsActive: activeMonthsCount
        }
    }, [effectiveByHolding, effectiveMonthly, kpiRange, cy, cm, firstActiveDate])

    // ── 4. CHART-DATEN ───────────────────────────────────────────────────────
    const { chartMonthly, chartCum } = useMemo(() => {
        const allYears = Object.keys(effectiveMonthly || {}).map(Number).sort()
        let keepYears = allYears

        if (kpiRange === '3y') {
            keepYears = allYears.filter(y => y >= cy - 2)
        } else if (kpiRange === '12m' || kpiRange === 'ytd') {
            keepYears = allYears.filter(y => y >= cy - 1)
        }

        const resM = {}
        const resC = {}

        keepYears.forEach(y => {
            if (effectiveMonthly?.[y]) resM[y] = effectiveMonthly[y]
            if (effectiveCum?.[y])     resC[y] = effectiveCum[y]
        })

        if (effectiveMonthly?.[cy] && !resM[cy]) resM[cy] = effectiveMonthly[cy]
        if (effectiveCum?.[cy] && !resC[cy])     resC[cy] = effectiveCum[cy]

        return { chartMonthly: resM, chartCum: resC }
    }, [effectiveMonthly, effectiveCum, kpiRange, cy])

    // ── 5. PROGNOSE & WACHSTUM EXAKT HARMONISIEREN ───────────────────────────
    const growthMetrics = useMemo(() => {
        const sumOfYear = (y) => (effectiveMonthly?.[y] || []).reduce((s, v) => s + (v || 0), 0)

        const lastYearSum = sumOfYear(cy - 1)
        const currentYearActual = sumOfYear(cy)

        // Letzte 12 Monate rollierend (TTM)
        let rolling12mCurrent = 0
        let rolling12mPrev = 0
        for (let i = 0; i < 12; i++) {
            let m = cm - i
            let y = cy
            if (m < 0) { m += 12; y -= 1 }
            rolling12mCurrent += effectiveMonthly?.[y]?.[m] || 0

            let py = y - 1
            rolling12mPrev += effectiveMonthly?.[py]?.[m] || 0
        }

        // YoY: Bevorzuge Hook-Prop wenn da, sonst berechnen
        let yoyVal = propYoy ?? null
        if (yoyVal === null) {
            if (rolling12mPrev > 0) {
                yoyVal = +(((rolling12mCurrent / rolling12mPrev) - 1) * 100).toFixed(1)
            } else if (lastYearSum > 0 && currentYearActual > 0) {
                yoyVal = +(((currentYearActual / lastYearSum) - 1) * 100).toFixed(1)
            }
        }

        // Prognose: Bevorzuge Hook-Prop
        let forecastNext12m = propForecast12m?.total || propForecast12m?.net || 0
        if (!forecastNext12m || forecastNext12m === 0) {
            // Aus Forecast-Matrix summieren
            for (let i = 0; i < 12; i++) {
                const fm = (cm + 1 + i) % 12
                const fy = cy + Math.floor((cm + 1 + i) / 12)
                forecastNext12m += effectiveForecastMonthly?.[fy]?.[fm] || 0
            }
        }

        // KONSISTENZ-REGEL: Die Prognose für die nächsten 12 Monate
        // darf bei einem wachsenden Portfolio NIEMALS kleiner sein als das,
        // was in den letzten 12 Monaten bereits real eingenommen wurde!
        if (rolling12mCurrent > 0 && forecastNext12m < rolling12mCurrent) {
            forecastNext12m = rolling12mCurrent
        }

        // Wachstum laufendes Jahr vs. Vorjahr
        let yearGrowth = null
        if (lastYearSum > 0) {
            const cmpVal = currentYearActual > 0 ? currentYearActual : forecastNext12m
            yearGrowth = +(((cmpVal - lastYearSum) / lastYearSum) * 100).toFixed(1)
        }

        return {
            yoyVal,
            rolling12mCurrent,
            forecastNext12m,
            forecastNext12mAvg: +(forecastNext12m / 12).toFixed(2),
            yearGrowth,
            lastYearSum
        }
    }, [effectiveMonthly, effectiveForecastMonthly, propForecast12m, propYoy, cy, cm])

    // ── 6. KORREKTE DIVIDENDENRENDITE (ANNUALISIERT % P.A.) ───────────────────
    const baseValue = propCurrentValue > 0 ? propCurrentValue : inferredInvestedCapital

    // Aktuelle Rendite: Immer auf 1 Jahr bezogen (% p.a.)
    const yieldText = useMemo(() => {
        // Wenn Parqet vorhanden ist, nimm dessen exakten Wert
        if (propDividendYield?.[kpiRange] != null) {
            return fmtPct(propDividendYield[kpiRange])
        }

        if (baseValue > 0) {
            let annualNet = 0
            if (kpiRange === 'ytd') {
                annualNet = rangeTotals.net * (12 / Math.max(1, cm + 1))
            } else if (kpiRange === '12m') {
                annualNet = rangeTotals.net
            } else if (kpiRange === '3y') {
                annualNet = rangeTotals.net / 3
            } else {
                // Bei Gesamt: Reales Jahresmittel (Netto geteilt durch Jahre)
                const years = Math.max(1, monthsActive / 12)
                annualNet = rangeTotals.net / years
            }
            return fmtPct((annualNet / baseValue) * 100)
        }
        return '–'
    }, [baseValue, rangeTotals.net, kpiRange, cm, monthsActive, propDividendYield])

    // Prognostizierte Rendite: Nächste 12 Monate geteilt durch Kapital
    const forecastYieldText = useMemo(() => {
        if (baseValue > 0 && growthMetrics.forecastNext12m > 0) {
            return fmtPct((growthMetrics.forecastNext12m / baseValue) * 100)
        }
        return '–'
    }, [baseValue, growthMetrics.forecastNext12m])

    const currentRangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'

    // ── RENDERING ────────────────────────────────────────────────────────────
    const isLoading = (parqetLoading && !hasAnyData) || (dbLoading && !hasAnyData)
    if (showSkeleton || isLoading) return <SkeletonDashboard />
    if (!hasAnyData) return <EmptyStateView onRefresh={handleRefreshAll} loading={isLoading} error={error} />

    return (
        <div>
            {/* ZEITRAUM-SCHALTER & TITEL */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 14
            }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>📈 Dividenden Dashboard</h1>
                    <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2, marginBottom: 0 }}>Portfolio-Übersicht · Nettowerte</p>
                </div>

                <div style={{
                    display: 'inline-flex',
                    gap: 4,
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
            </div>

            {error && (
                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                    ⚠ {error}
                </div>
            )}

            {/* 1. KPI-REIHE */}
            <div className="kpi-grid">
                <KpiCard
                    label={`Dividenden Netto (${currentRangeLabel})`}
                    value={fmt(rangeTotals.net)}
                    color="#22c55e"
                    detail={{ label: 'Ø Monatlich', value: fmt(rangeTotals.avg), color: '#a78bfa' }}
                />
                <KpiCard
                    label="Brutto"
                    value={fmt(rangeTotals.gross)}
                    color="#60a5fa"
                    detail={{ label: 'davon Steuern', value: fmt(rangeTotals.tax), color: '#fb923c' }}
                />
                <KpiCard
                    label="Dividendenrendite"
                    value={yieldText}
                    color="#34d399"
                    sub={baseValue > 0 ? (propCurrentValue > 0 ? "auf Marktwert (annualisiert)" : "auf investiertes Kapital (p.a.)") : "Marktwert noch nicht erfasst"}
                />
            </div>

            {/* 2. KPI-REIHE (WACHSTUM) */}
            <div className="kpi-grid">
                <KpiCard
                    label="YoY-Wachstum"
                    value={growthMetrics.yoyVal !== null ? `${growthMetrics.yoyVal >= 0 ? '+' : ''}${String(growthMetrics.yoyVal).replace('.', ',')} %` : '–'}
                    color={growthMetrics.yoyVal !== null ? (growthMetrics.yoyVal >= 0 ? '#22c55e' : '#ef4444') : '#556070'}
                    sub={growthMetrics.yoyVal !== null ? '12M rollierend vs. Vorjahr' : 'Noch keine 2 vollen Vergleichsjahre'}
                />
                <KpiCard
                    label={`Wachstum ${cy} vs. ${cy - 1}`}
                    value={growthMetrics.yearGrowth !== null ? `${growthMetrics.yearGrowth >= 0 ? '+' : ''}${String(growthMetrics.yearGrowth).replace('.', ',')} %` : '–'}
                    color={growthMetrics.yearGrowth !== null ? (growthMetrics.yearGrowth >= 0 ? '#22c55e' : '#ef4444') : '#7a8ba0'}
                    sub={growthMetrics.lastYearSum > 0 ? `Vorjahr: ${fmt(growthMetrics.lastYearSum)}` : 'Kein Vorjahr vorhanden'}
                />
            </div>

            {/* 3. KPI-REIHE (PROGNOSE) */}
            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
            <div className="kpi-grid">
                <KpiCard
                    label="Voraussichtlich Netto"
                    value={fmt(growthMetrics.forecastNext12m)}
                    color="#f472b6"
                    detail={{ label:'Ø Monatlich', value: fmt(growthMetrics.forecastNext12mAvg), color:'#f472b6' }}
                    sub="Hochrechnung aus bisherigen Zahlungen"
                />
                <KpiCard
                    label="Progn. Dividendenrendite"
                    value={forecastYieldText}
                    color="#5bcec2"
                    sub="Nächste 12M / Portfoliobasis"
                />
            </div>

            {/* CHARTS */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))',
                gap: 16,
                marginTop: 16,
                alignItems: 'stretch'
            }}>
                <DividendChart
                    monthly={chartMonthly}
                    forecastMonthly={effectiveForecastMonthly}
                    byHolding={filteredByHolding}
                    forecastByHolding={effectiveForecastByHolding}
                    kpiRange={kpiRange}
                />
                <CumulativeDividendChart
                    monthly={chartMonthly}
                    cum={chartCum}
                    forecastCum={effectiveForecastCum}
                    byHolding={filteredByHolding}
                />
            </div>

            {/* HEATMAP */}
            <div style={{ marginTop: 16 }}>
                <DividendHeatmap monthly={filteredMonthlyForHeatmap} />
            </div>

            {/* DONUT & TABELLE */}
            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DividendDonut byHolding={filteredByHolding} kpiRange={kpiRange} />
                <PositionsTable byHolding={filteredByHolding} kpiRange={kpiRange} />
            </div>
        </div>
    )
}