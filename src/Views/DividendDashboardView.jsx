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
                                                  k,
                                                  dividendYield,
                                                  trueCagr,
                                                  yoy,
                                                  hasRealData,
                                                  realTotal,
                                                  inflation,
                                                  forecast12m,
                                                  cy = new Date().getFullYear(),
                                                  forecastMonthly,
                                                  monthly: propMonthly,
                                                  cum: propCum,
                                                  forecastCum,
                                                  byHolding: propByHolding,
                                                  forecastByHolding,
                                                  currentValue = 0,
                                                  yearTotal,
                                              }) {
    const cm = new Date().getMonth()

    // ── 1. ALLE HOOKS MÜSSEN GANZ OBEN STEHEN ──────────────────────────────────
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

    // 2. Datenquelle Parqet oder Supabase ermitteln
    const { effectiveMonthly, effectiveByHolding, effectiveCum, hasAnyData } = useMemo(() => {
        const hasPropMonthly = Boolean(propMonthly && Object.keys(propMonthly).length > 0)

        if (hasPropMonthly) {
            return {
                effectiveMonthly: propMonthly,
                effectiveByHolding: propByHolding || {},
                effectiveCum: propCum || {},
                hasAnyData: true,
            }
        }

        const synthM = {}
        const synthH = {}
        const synthC = {}
        let divCount = 0

        if (Array.isArray(dbActivities) && dbActivities.length > 0) {
            dbActivities.forEach(a => {
                const type = String(a.type || '').toLowerCase()
                if (type !== 'dividend') return

                divCount++
                const d = new Date(a.date || a.datetime || 0)
                if (isNaN(d.getTime())) return

                const y = d.getFullYear()
                const m = d.getMonth()
                const net = Number(a.amountNet ?? a.amount ?? 0)
                const gross = Number(a.gross ?? a.amount ?? net)
                const tax = Number(a.tax ?? 0)
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

        return {
            effectiveMonthly: synthM,
            effectiveByHolding: synthH,
            effectiveCum: synthC,
            hasAnyData: divCount > 0
        }
    }, [propMonthly, propByHolding, propCum, dbActivities])

    // 3. Zeitraumfilter
    const { filteredByHolding, filteredMonthlyForHeatmap, rangeTotals } = useMemo(() => {
        let net = 0
        let gross = 0
        let tax = 0
        let countMonths = 0

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
                        const tVal = h.tax?.[y]?.[m] || (gVal - nVal)

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
                        const g = h.gross?.[y]?.[m] || 0
                        const t = h.tax?.[y]?.[m] || 0
                        gross += g
                        tax += t
                    })
                    countMonths++
                }
            }
        })

        const monthsDivisor = kpiRange === 'ytd' ? (cm + 1) : kpiRange === '12m' ? 12 : kpiRange === '3y' ? 36 : Math.max(1, countMonths)
        const avg = net / Math.max(1, monthsDivisor)

        return {
            filteredByHolding: resByHolding,
            filteredMonthlyForHeatmap: resMonthly,
            rangeTotals: {
                net,
                gross: gross > 0 ? gross : net,
                tax,
                avg
            }
        }
    }, [effectiveByHolding, effectiveMonthly, kpiRange, cy, cm])

    // 4. Chart-Daten
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

    // 5. KPIs
    const activeK = useMemo(() => {
        if (kpiRange === 'all' && k && rangeTotals.net === 0) return k
        return {
            net: fmt(rangeTotals.net),
            gross: fmt(rangeTotals.gross),
            tax: fmt(rangeTotals.tax),
            avg: fmt(rangeTotals.avg),
        }
    }, [kpiRange, k, rangeTotals])

    const activeYield = useMemo(() => {
        if (currentValue > 0 && rangeTotals.net > 0) {
            let annualFactor = 1
            if (kpiRange === 'ytd') annualFactor = 12 / Math.max(1, cm + 1)
            if (kpiRange === '3y')  annualFactor = 1 / 3
            if (kpiRange === '12m') annualFactor = 1
            const annualizedNet = rangeTotals.net * annualFactor
            return fmtPct((annualizedNet / currentValue) * 100)
        }
        return dividendYield?.[kpiRange] ? fmtPct(dividendYield[kpiRange]) : '–'
    }, [currentValue, rangeTotals, kpiRange, cm, dividendYield])

    const currentRangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'

    // ── ERST HIER UNTEN DÜRFEN VORZEITIGE RETURNS KOMMEN ──────────────────────
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
                    sub={currentValue > 0 ? "auf Marktwert (annualisiert)" : "Marktwert noch nicht erfasst"}
                />
            </div>

            {/* 2. KPI-REIHE (WACHSTUM & REAL) */}
            <div className="kpi-grid">
                {trueCagr !== null && (
                    <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to}`} />
                )}
                <KpiCard label="YoY-Wachstum" value={yoy === null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy === null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy === null ? 'Nicht genügend Daten' : '12M vs. Vorjahr'} />
                {hasRealData && (
                    <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Verlust', value: fmt(inflation), color: '#ef4444' }} sub={`Basis: ${Object.keys(effectiveMonthly || {}).map(Number).sort()[0]}`} />
                )}
            </div>

            {/* 3. KPI-REIHE (PROGNOSE) */}
            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
            <div className="kpi-grid">
                <KpiCard label="Voraussichtlich Netto" value={forecast12m ? fmt(forecast12m.total) : '–'} color="#f472b6" detail={{ label:'Ø Monatlich', value: forecast12m ? fmt(forecast12m.avg) : '–', color:'#f472b6' }} sub="Basierend auf Vorjahren" />
                <KpiCard
                    label={`Wachstum ${cy} vs. ${cy - 1}`}
                    value={(() => {
                        const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0);
                        const actualLastYear = typeof yearTotal === 'function' ? yearTotal(effectiveMonthly, cy - 1) : 0;
                        if (!actualLastYear || actualLastYear === 0) return '–';
                        const growth = ((forecastCurrentYear - actualLastYear) / actualLastYear) * 100;
                        return (growth >= 0 ? '+' : '') + growth.toFixed(1).replace('.', ',') + ' %';
                    })()}
                    color="#22c55e"
                    sub="Prognose Gesamtjahr"
                />
                <KpiCard
                    label="Progn. Dividendenrendite"
                    value={(() => {
                        let totalF = 0
                        for (let i = 0; i < 12; i++) {
                            const fm = (cm + 1 + i) % 12
                            const fy = cy + Math.floor((cm + 1 + i) / 12)
                            totalF += forecastMonthly?.[fy]?.[fm] ?? 0
                        }
                        if (!currentValue || currentValue === 0) return '–';
                        return fmtPct((totalF / currentValue) * 100);
                    })()}
                    color="#5bcec2"
                    sub="Nächste 12M / Marktwert"
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
                    forecastMonthly={forecastMonthly}
                    byHolding={filteredByHolding}
                    forecastByHolding={forecastByHolding}
                    kpiRange={kpiRange}
                />
                <CumulativeDividendChart
                    monthly={chartMonthly}
                    cum={chartCum}
                    forecastCum={forecastCum}
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