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
import { calcRealTotal } from '../inflation.js'

const fmt = n => (+n).toFixed(2).replace('.', ',') + ' €'
const fmtPct = n => `${(+n).toFixed(2).replace('.', ',')} %`

const KPI_RANGES = [
    { key: 'all', label: 'Gesamt' },
    { key: 'ytd', label: 'YTD'   },
    { key: '12m', label: '12M'   },
    { key: '3y',  label: '3J'    },
]

function yearTotal(mMap, y) {
    const arr = mMap?.[y]
    if (!arr) return 0
    return arr.reduce((s, v) => s + (v || 0), 0)
}
function rolling12m(mMap, endY, endM) {
    let sum = 0
    for (let i = 0; i < 12; i++) {
        let m = endM - i, y = endY
        if (m < 0) { m += 12; y -= 1 }
        sum += mMap?.[y]?.[m] ?? 0
    }
    return sum
}

export default function DividendDashboardView(props) {
    const {
        showSkeleton, showEmpty,
        loadData, loading, error,
        kpiRange: propKpiRange, setKpiRange: propSetKpiRange,
        k: propK,
        dividendYield: propDividendYield,
        trueCagr: propTrueCagr,
        yoy: propYoy,
        hasRealData: propHasRealData,
        realTotal: propRealTotal,
        inflation: propInflation,
        forecast12m: propForecast12m,
        cy = new Date().getFullYear(),
        forecastMonthly: propForecastMonthly,
        monthly: propMonthly,
        cum: propCum,
        forecastCum: propForecastCum,
        byHolding: propByHolding,
        forecastByHolding: propForecastByHolding,
        currentValue: propCurrentValue = 0,
        yearTotal: propYearTotalFn,
        holdings = [],
        enrichedHoldings = [],
    } = props

    const cm = new Date().getMonth()
    const [ownRange, setOwnRange] = useState('all')
    const kpiRange = propKpiRange ?? ownRange
    const setKpiRange = propSetKpiRange ?? setOwnRange

    // ── KERNREGEL: Wenn echte Parqet-Props vorliegen, NICHTS neu berechnen! ───
    const hasPropData = Boolean(propMonthly && Object.keys(propMonthly).length > 0)

    // ── SUPABASE-FALLBACK (nur relevant, wenn KEINE Parqet-Daten vorliegen) ───
    const [dbActs, setDbActs] = useState([])
    const [dbLoading, setDbLoading] = useState(true)
    const [dbError, setDbError] = useState(null)

    const loadDb = async () => {
        setDbLoading(true)
        try {
            const data = await fetchAllDbActivities()
            setDbActs(data || [])
            setDbError(null)
        } catch (e) {
            setDbError(e.message)
        } finally {
            setDbLoading(false)
        }
    }

    useEffect(() => {
        if (!hasPropData) loadDb()
        else setDbLoading(false)
    }, [hasPropData])

    const handleRefresh = async () => {
        await loadDb()
        if (loadData) await loadData()
    }

    // Synthese ausschließlich für den reinen Supabase-Modus
    const fallback = useMemo(() => {
        if (hasPropData) return null

        const m = {}
        const h = {}
        let totalBuy = 0

        ;(dbActs || []).forEach(a => {
            const type = String(a.type || '').toLowerCase()
            const amt = Number(a.amount ?? 0)
            if (type === 'buy') totalBuy += amt
            if (type === 'sell') totalBuy = Math.max(0, totalBuy - amt)
            if (type !== 'dividend') return

            const d = new Date(a.date || a.datetime || 0)
            if (isNaN(d.getTime())) return

            const y = d.getFullYear(), mon = d.getMonth()
            const net = Number(a.amountNet ?? a.amount ?? 0)
            const tax = Number(a.tax ?? 0)
            const gross = (Number(a.gross) > net) ? Number(a.gross) : +(net + tax).toFixed(2)
            const key = a.isin || a.name || 'Unbekannt'

            if (!m[y]) m[y] = Array(12).fill(0)
            m[y][mon] = +(m[y][mon] + net).toFixed(2)

            if (!h[key]) h[key] = { name: a.name || key, isin: a.isin || key, assetType: a.assetType || 'Security', totalNet: 0, monthly: {}, gross: {}, tax: {} }
            if (!h[key].monthly[y]) h[key].monthly[y] = Array(12).fill(0)
            if (!h[key].gross[y])   h[key].gross[y] = Array(12).fill(0)
            if (!h[key].tax[y])     h[key].tax[y] = Array(12).fill(0)
            h[key].monthly[y][mon] = +(h[key].monthly[y][mon] + net).toFixed(2)
            h[key].gross[y][mon]   = +(h[key].gross[y][mon] + gross).toFixed(2)
            h[key].tax[y][mon]     = +(h[key].tax[y][mon] + tax).toFixed(2)
            h[key].totalNet        = +(h[key].totalNet + net).toFixed(2)
        })

        const cumLocal = {}
        Object.keys(m).forEach(y => {
            cumLocal[y] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) { running += (m[y][i] || 0); cumLocal[y][i] = +running.toFixed(2) }
        })

        // ── WACHSTUMSBASIERTE PROGNOSE PRO POSITION ────────────────────────────
        // Berechnet pro Position einen individuellen Wachstumsfaktor (TTM vs. Vorjahres-TTM)
        // und wendet ihn auf die Vorjahreszahlung desselben Kalendermonats an.

        const sumRange = (holdingMonthly, endY, endM, monthsBack) => {
            let sum = 0
            for (let i = 0; i < monthsBack; i++) {
                let mo = endM - i, y = endY
                if (mo < 0) { mo += 12; y -= 1 }
                sum += holdingMonthly?.[y]?.[mo] || 0
            }
            return sum
        }

        const findLastKnownForMonth = (holdingMonthly, targetMonth, beforeYear) => {
            const years = Object.keys(holdingMonthly).map(Number).sort((a, b) => b - a)
            for (const y of years) {
                if (y >= beforeYear) continue
                const v = holdingMonthly[y]?.[targetMonth]
                if (v > 0) return v
            }
            return 0
        }

        const MAX_GROWTH_FACTOR = 5    // Deckel nach oben (verhindert Explosion bei Kleinstbeträgen)
        const MIN_GROWTH_FACTOR = 0.3  // Deckel nach unten (verhindert unrealistischen Totalausfall)

        const forecastH = {}
        const forecastM = {}
        ;[cy, cy + 1].forEach(ty => { forecastM[ty] = Array(12).fill(0) })

        Object.entries(h).forEach(([key, hh]) => {
            // TTM der letzten bekannten 12 Monate vs. die 12 Monate davor (für diese EINE Position)
            const ttmCurrent = sumRange(hh.monthly, cy, cm, 12)
            const ttmPrevious = sumRange(hh.monthly, cy, cm - 12, 12)

            let growthFactor = 1
            if (ttmPrevious > 0 && ttmCurrent > 0) {
                growthFactor = ttmCurrent / ttmPrevious
                // Deckel anwenden, um Extremwerte abzufedern
                growthFactor = Math.min(MAX_GROWTH_FACTOR, Math.max(MIN_GROWTH_FACTOR, growthFactor))
            } else if (ttmPrevious === 0 && ttmCurrent > 0) {
                // Komplett neue Position ohne Vorjahresbasis: kein künstliches Wachstum aufschlagen
                growthFactor = 1
            }

            const fMonthly = {}
            ;[cy, cy + 1].forEach(ty => {
                fMonthly[ty] = Array(12).fill(0)
                for (let i = 0; i < 12; i++) {
                    let val = 0
                    if (ty === cy && i <= cm) {
                        // Vergangene Monate: Ist-Werte 1:1 übernehmen
                        val = hh.monthly?.[cy]?.[i] || 0
                    } else {
                        // Zukünftige Monate: Vorjahreswert * individueller Wachstumsfaktor
                        const baseVal = hh.monthly?.[ty - 1]?.[i] || findLastKnownForMonth(hh.monthly, i, ty)
                        val = baseVal * growthFactor
                    }
                    fMonthly[ty][i] = +val.toFixed(2)
                    forecastM[ty][i] = +((forecastM[ty][i] || 0) + val).toFixed(2)
                }
            })
            forecastH[key] = { ...hh, monthly: fMonthly, growthFactor: +growthFactor.toFixed(2) }
        })

        // Kumulierte Prognose
        const forecastC = {}
        ;[cy, cy + 1].forEach(ty => {
            forecastC[ty] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) { running += (forecastM[ty][i] || 0); forecastC[ty][i] = +running.toFixed(2) }
        })

        // forecast12m: Summe der nächsten 12 Monate ab dem Folgemonat
        let total = 0
        for (let i = 0; i < 12; i++) {
            const fm = (cm + 1 + i) % 12
            const fy = cy + Math.floor((cm + 1 + i) / 12)
            total += forecastM?.[fy]?.[fm] ?? 0
        }
        const forecast12mLocal = { total: +total.toFixed(2), avg: +(total / 12).toFixed(2), net: +total.toFixed(2) }

        // yoy exakt wie im Original
        const latest = rolling12m(m, cy, cm)
        const prevY = rolling12m(m, cy - 1, cm)
        const yoyLocal = (latest < 1 || prevY < 1) ? null : +((latest / prevY - 1) * 100).toFixed(1)

        // CAGR exakt wie im Original
        const years = Object.keys(m).map(Number).filter(y => y < cy).sort()
        let cagrLocal = null
        if (years.length >= 2) {
            const firstYear = years[0], lastYear = years[years.length - 1], numYears = lastYear - firstYear
            const startVal = yearTotal(m, firstYear), endVal = yearTotal(m, lastYear)
            if (startVal >= 1 && endVal >= 1 && numYears >= 1) {
                cagrLocal = { value: +(((Math.pow(endVal / startVal, 1 / numYears) - 1) * 100)).toFixed(1), from: firstYear, to: lastYear, years: numYears }
            }
        }

        // kpi je Range (all/ytd/12m/3y)
        const buildKpiForRange = (range) => {
            let net = 0, gross = 0, tax = 0
            const isIn = (y, mo) => {
                if (range === 'all') return true
                if (range === 'ytd') return y === cy && mo <= cm
                if (range === '12m') { const diff = (cy - y) * 12 + (cm - mo); return diff >= 0 && diff < 12 }
                if (range === '3y')  { const diff = (cy - y) * 12 + (cm - mo); return diff >= 0 && diff < 36 }
                return true
            }
            Object.keys(m).forEach(yStr => {
                const y = Number(yStr)
                for (let mo = 0; mo < 12; mo++) {
                    if (isIn(y, mo)) {
                        net += m[y][mo] || 0
                        Object.values(h).forEach(hh => {
                            gross += hh.gross?.[y]?.[mo] || 0
                            tax += hh.tax?.[y]?.[mo] || 0
                        })
                    }
                }
            })
            let divisor = 1
            if (range === 'ytd') divisor = cm + 1
            else if (range === '12m') divisor = 12
            else if (range === '3y') divisor = 36
            else {
                const ys = Object.keys(m).map(Number).sort()
                divisor = ys.length ? Math.max(1, (cy - ys[0]) * 12 + cm + 1) : 1
            }
            return { net: +net.toFixed(2), gross: +(gross > 0 ? gross : net + tax).toFixed(2), tax: +tax.toFixed(2), avgMonthly: +(net / divisor).toFixed(2) }
        }

        const kpiLocal = {
            all: buildKpiForRange('all'),
            ytd: buildKpiForRange('ytd'),
            '12m': buildKpiForRange('12m'),
            '3y': buildKpiForRange('3y'),
        }

        const liveVal = propCurrentValue > 0 ? propCurrentValue : totalBuy

        const dividendYieldLocal = {}
        ;['all', 'ytd', '12m', '3y'].forEach(r => {
            let factor = 1
            if (r === 'ytd') factor = 12 / Math.max(1, cm + 1)
            if (r === '3y') factor = 1 / 3
            dividendYieldLocal[r] = liveVal > 0 ? +(((kpiLocal[r].net * factor) / liveVal) * 100).toFixed(2) : 0
        })

        const nominalTotal = kpiLocal.all.net
        const realVal = calcRealTotal(m)
        const hasReal = nominalTotal > 0 && Object.keys(m).length > 1

        return {
            monthly: m, byHolding: h, cum: cumLocal,
            forecastMonthly: forecastM, forecastCum: forecastC, forecastByHolding: forecastH,
            forecast12m: forecast12mLocal, yoy: yoyLocal, trueCagr: cagrLocal,
            kpi: kpiLocal, dividendYield: dividendYieldLocal,
            currentValue: liveVal, realTotal: realVal, inflation: nominalTotal - realVal,
            hasRealData: hasReal, hasRecords: Object.keys(m).length > 0,
        }
    }, [hasPropData, dbActs, propCurrentValue, cy, cm])

    // ── EFFEKTIVE WERTE: Props haben IMMER Vorrang vor dem Fallback ───────────
    const monthly = hasPropData ? propMonthly : (fallback?.monthly || {})
    const byHolding = hasPropData ? (propByHolding || {}) : (fallback?.byHolding || {})
    const forecastMonthly = hasPropData ? propForecastMonthly : (fallback?.forecastMonthly || {})
    const forecastByHolding = hasPropData ? propForecastByHolding : (fallback?.forecastByHolding || {})
    const forecastCumEff = hasPropData ? propForecastCum : (fallback?.forecastCum || {})
    const forecast12m = hasPropData ? propForecast12m : fallback?.forecast12m
    const yoy = hasPropData ? propYoy : fallback?.yoy
    const trueCagr = hasPropData ? propTrueCagr : fallback?.trueCagr
    const k = hasPropData ? propK : (fallback ? { net: fmt(fallback.kpi[kpiRange]?.net ?? 0), gross: fmt(fallback.kpi[kpiRange]?.gross ?? 0), tax: fmt(fallback.kpi[kpiRange]?.tax ?? 0), avg: fmt(fallback.kpi[kpiRange]?.avgMonthly ?? 0) } : { net: '–', gross: '–', tax: '–', avg: '–' })
    const dividendYield = hasPropData ? propDividendYield : (fallback?.dividendYield || {})
    const currentValue = hasPropData ? propCurrentValue : (fallback?.currentValue || 0)
    const realTotal = hasPropData ? propRealTotal : fallback?.realTotal
    const inflation = hasPropData ? propInflation : fallback?.inflation
    const hasRealData = hasPropData ? propHasRealData : fallback?.hasRealData
    const hasAnyRecords = hasPropData ? true : Boolean(fallback?.hasRecords)

    // ── ZEITRAUM-FILTER NUR FÜR CHARTS / TABELLE / HEATMAP / DONUT ────────────
    const { filteredByHolding, filteredMonthlyForHeatmap } = useMemo(() => {
        const isInRange = (y, m) => {
            if (kpiRange === 'all') return true
            if (kpiRange === 'ytd') return y === cy && m <= cm
            if (kpiRange === '12m') { const diff = (cy - y) * 12 + (cm - m); return diff >= 0 && diff < 12 }
            if (kpiRange === '3y')  { const diff = (cy - y) * 12 + (cm - m); return diff >= 0 && diff < 36 }
            return true
        }

        const resByHolding = {}
        Object.entries(byHolding || {}).forEach(([isin, h]) => {
            const newM = {}, newG = {}, newT = {}
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
                        newM[y][m] = nVal; newG[y][m] = gVal; newT[y][m] = tVal
                    }
                }
            })
            resByHolding[isin] = { ...h, monthly: newM, gross: newG, tax: newT }
        })

        const resMonthly = {}
        Object.keys(monthly || {}).forEach(yStr => {
            const y = Number(yStr)
            for (let m = 0; m < 12; m++) {
                if (isInRange(y, m)) {
                    if (!resMonthly[y]) resMonthly[y] = Array(12).fill(0)
                    resMonthly[y][m] = monthly?.[y]?.[m] || 0
                }
            }
        })

        return { filteredByHolding: resByHolding, filteredMonthlyForHeatmap: resMonthly }
    }, [byHolding, monthly, kpiRange, cy, cm])

    const { chartMonthly, chartCum } = useMemo(() => {
        const cumSource = hasPropData ? propCum : fallback?.cum
        const allYears = Object.keys(monthly || {}).map(Number).sort()
        let keepYears = allYears
        if (kpiRange === '3y') keepYears = allYears.filter(y => y >= cy - 2)
        else if (kpiRange === '12m' || kpiRange === 'ytd') keepYears = allYears.filter(y => y >= cy - 1)

        const resM = {}, resC = {}
        keepYears.forEach(y => {
            if (monthly?.[y]) resM[y] = monthly[y]
            if (cumSource?.[y]) resC[y] = cumSource[y]
        })
        if (monthly?.[cy] && !resM[cy]) resM[cy] = monthly[cy]
        if (cumSource?.[cy] && !resC[cy]) resC[cy] = cumSource[cy]

        return { chartMonthly: resM, chartCum: resC }
    }, [monthly, propCum, fallback, kpiRange, cy, hasPropData])

    const calcForecastNext12mNet = () => {
        let total = 0
        for (let i = 0; i < 12; i++) {
            const fm = (cm + 1 + i) % 12
            const fy = cy + Math.floor((cm + 1 + i) / 12)
            total += forecastMonthly?.[fy]?.[fm] ?? 0
        }
        return +total.toFixed(2)
    }

    const yearTotalFn = propYearTotalFn || yearTotal
    const currentRangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'

    // ── RENDERING ────────────────────────────────────────────────────────────
    if (showSkeleton && hasPropData) return <SkeletonDashboard />
    if (!hasPropData && dbLoading && !hasAnyRecords) return <SkeletonDashboard />
    if (!hasAnyRecords) {
        return <EmptyStateView onRefresh={handleRefresh} loading={dbLoading} error={error || dbError} />
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                    <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0', margin: 0 }}>📈 Dividenden Dashboard</h1>
                    <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2, marginBottom: 0 }}>Portfolio-Übersicht · Nettowerte</p>
                </div>
                <div style={{ display: 'inline-flex', gap: 4, background: '#0f1420', padding: 3, borderRadius: 22, border: '1px solid #1e2a3a', flexWrap: 'wrap' }}>
                    {KPI_RANGES.map(({ key, label }) => (
                        <button key={key} onClick={() => setKpiRange(key)} style={{
                            padding: '4px 14px', borderRadius: 18, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                            background: kpiRange === key ? '#009991' : 'transparent', color: kpiRange === key ? '#ffffff' : '#7a8ba0', transition: 'all 0.15s ease'
                        }}>{label}</button>
                    ))}
                </div>
            </div>

            {(error || dbError) && (
                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                    ⚠ {error || dbError}
                </div>
            )}

            <div className="kpi-grid">
                <KpiCard label={`Dividenden Netto (${currentRangeLabel})`} value={k.net} color="#22c55e" detail={{ label: 'Ø Monatlich', value: k.avg, color: '#a78bfa' }} />
                <KpiCard label="Brutto" value={k.gross} color="#60a5fa" detail={{ label: 'davon Steuern', value: k.tax, color: '#fb923c' }} />
                <KpiCard label="Dividendenrendite" value={dividendYield?.[kpiRange] != null ? fmtPct(dividendYield[kpiRange]) : '–'} color="#34d399" sub={currentValue > 0 ? "auf Marktwert (annualisiert)" : "Marktwert noch nicht erfasst"} />
            </div>

            <div className="kpi-grid">
                {trueCagr != null && (
                    <KpiCard label={`CAGR (${trueCagr.years}J)`} value={(trueCagr.value >= 0 ? '+' : '') + String(trueCagr.value).replace('.', ',') + ' %'} color={trueCagr.value >= 0 ? '#5bcec2' : '#ef4444'} sub={`${trueCagr.from} – ${trueCagr.to}`} />
                )}
                <KpiCard label="YoY-Wachstum" value={yoy == null ? '–' : (yoy >= 0 ? '+' : '') + String(yoy).replace('.', ',') + ' %'} color={yoy == null ? '#556070' : yoy >= 0 ? '#22c55e' : '#ef4444'} sub={yoy == null ? 'Nicht genügend Daten' : '12M vs. Vorjahr'} />
                {hasRealData && (
                    <KpiCard label="Real (inflationsber.)" value={fmt(realTotal)} color="#f59e0b" detail={{ label: 'Verlust', value: fmt(inflation), color: '#ef4444' }} sub={`Basis: ${Object.keys(monthly || {}).map(Number).sort()[0]}`} />
                )}
            </div>

            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
            <div className="kpi-grid">
                <KpiCard label="Voraussichtlich Netto" value={forecast12m ? fmt(forecast12m.total) : '–'} color="#f472b6" detail={{ label:'Ø Monatlich', value: forecast12m ? fmt(forecast12m.avg) : '–', color:'#f472b6' }} sub="Basierend auf Vorjahren" />
                <KpiCard
                    label={`Wachstum ${cy} vs. ${cy - 1}`}
                    value={(() => {
                        const forecastCurrentYear = (forecastMonthly?.[cy] || []).reduce((s, v) => s + v, 0);
                        const actualLastYear = yearTotalFn(monthly, cy - 1);
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
                        const forecastNet = calcForecastNext12mNet();
                        if (!currentValue || currentValue === 0) return '–';
                        return fmtPct((forecastNet / currentValue) * 100);
                    })()}
                    color="#5bcec2"
                    sub="Nächste 12M / Marktwert"
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 16, marginTop: 16, alignItems: 'stretch' }}>
                <DividendChart monthly={chartMonthly} forecastMonthly={forecastMonthly} byHolding={filteredByHolding} forecastByHolding={forecastByHolding} kpiRange={kpiRange} />
                <CumulativeDividendChart monthly={chartMonthly} cum={chartCum} forecastCum={forecastCumEff} byHolding={filteredByHolding} />
            </div>

            <div style={{ marginTop: 16 }}>
                <DividendHeatmap monthly={filteredMonthlyForHeatmap} />
            </div>

            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DividendDonut byHolding={filteredByHolding} kpiRange={kpiRange} />
                <PositionsTable byHolding={filteredByHolding} kpiRange={kpiRange} />
            </div>
        </div>
    )
}