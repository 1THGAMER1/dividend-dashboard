import React, { useMemo, useState, useEffect } from 'react'
import KpiCard from '../components/KpiCard.jsx'
import DividendChart from '../components/DividendChart.jsx'
import CumulativeDividendChart from '../components/CumulativeDividendChart.jsx'
import DividendHeatmap from '../components/DividendHeatmap.jsx'
import PositionsTable from '../components/PositionsTable.jsx'
import DividendDonut from '../components/DividendDonut.jsx'
import SkeletonDashboard from '../components/SkeletonDashboard.jsx'
import EmptyStateView from './EmptyStateView.jsx'
import { calcRealTotal } from '../inflation.js'
import { fetchAllDbActivities, toParqetShape } from '../utils/manualActivities'
import { buildForecast, groupByYearMonth, toCumulative, groupByHolding } from '../utils/dataUtils.js'

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
        let m = endM - i
        let y = endY
        if (m < 0) { m += 12; y -= 1 }
        sum += mMap?.[y]?.[m] ?? 0
    }
    return sum
}

// Saisonale Prognose aus den eigenen Daten: gleicher Monat im Vorjahr (sonst vor zwei Jahren)
function seasonalForecast(monthly, cy, cm) {
    const fm = {}
    for (let i = 1; i <= 12; i++) {
        const idx = cm + i
        const y = cy + Math.floor(idx / 12)
        const m = idx % 12
        const prev = monthly?.[y - 1]?.[m] ?? monthly?.[y - 2]?.[m] ?? 0
        if (!fm[y]) fm[y] = Array(12).fill(0)
        fm[y][m] = +prev.toFixed(2)
    }
    return fm
}

export default function DividendDashboardView({
                                                  showSkeleton: propSkeleton,
                                                  loadData: propLoadData,
                                                  loading: parqetLoading,
                                                  error: propError,
                                                  kpiRange: propKpiRange,
                                                  setKpiRange: propSetKpiRange,
                                                  cy = new Date().getFullYear(),
                                                  currentValue: propCurrentValue = 0,
                                                  monthly: propMonthly,
                                                  byHolding: propByHolding,
                                                  forecastMonthly: propForecastMonthly,
                                                  forecastCum: propForecastCum,
                                                  forecastByHolding: propForecastByHolding,
                                                  forecast12m: propForecast12m,
                                                  dividendYield: propDividendYield,
                                                  trueCagr: propTrueCagr,
                                                  yoy: propYoy,
                                                  realTotal: propRealTotal,
                                                  inflation: propInflation,
                                                  hasRealData: propHasRealData,
                                                  holdings = [],
                                                  enrichedHoldings = [],
                                              }) {
    const cm = new Date().getMonth()

    const [ownRange, setOwnRange] = useState('all')
    const kpiRange = propKpiRange ?? ownRange
    const setKpiRange = propSetKpiRange ?? setOwnRange

    // ── 1. SUPABASE-DATEN LADEN ──────────────────────────────────────────────
    const [dbActs, setDbActs] = useState([])
    const [dbLoading, setDbLoading] = useState(true)
    const [error, setError] = useState(propError || null)

    const loadDb = async () => {
        setDbLoading(true)
        try {
            const data = await fetchAllDbActivities()
            setDbActs(data || [])
            setError(null)
        } catch (e) {
            setError(e.message)
        } finally {
            setDbLoading(false)
        }
    }

    useEffect(() => {
        loadDb()
    }, [])

    const handleRefresh = async () => {
        await loadDb()
        if (propLoadData) await propLoadData()
    }

    const baseData = useMemo(() => {
        const hasParqet = Boolean(propMonthly && Object.keys(propMonthly).length > 0)

        if (hasParqet) {
            return { hasParqet: true, monthly: propMonthly, byHolding: propByHolding || {}, hasRecords: true, liveValue: propCurrentValue, forecast: null }
        }

        // Eigene Daten in Parqet-Form bringen und durch dieselben Funktionen schicken wie im Hook
        const all = (dbActs || []).map(toParqetShape)
        const divActs  = all.filter(a => a.type === 'dividend')
        const buyActs  = all.filter(a => a.type === 'buy')
        const sellActs = all.filter(a => a.type === 'sell')

        const names = {}, types = {}, tickers = {}
        all.forEach(a => {
            const k = a.asset.isin
            if (!names[k]) names[k] = a.asset.name || k
            if (!types[k] && a.holdingAssetType) types[k] = a.holdingAssetType
            tickers[k] = k
        })
        const purchaseValues = {}
        buyActs.forEach(a => {
            const k = a.asset.isin
            purchaseValues[k] = (purchaseValues[k] || 0) + (a.amount || 0)
        })

        const m  = groupByYearMonth(divActs)
        const c  = toCumulative(m)
        const bh = groupByHolding(divActs, names, types, purchaseValues, tickers)

        let fc = null
        try {
            fc = buildForecast(c, divActs, buyActs, names, {}, sellActs, types, {})
        } catch (err) {
            console.warn('buildForecast (eigene Daten) fehlgeschlagen:', err)
        }

        // Marktwert: aus den Positionen der App, sonst Einstand aus der Berechnung
        const holdingsValue = (enrichedHoldings?.length ? enrichedHoldings : holdings || [])
            .reduce((s, p) => s + (Number(p.value) || 0), 0)
        const fcValue = (fc?.enrichedHoldings || []).reduce((s, p) => s + (Number(p.value) || 0), 0)

        return {
            hasParqet: false,
            monthly: m,
            byHolding: bh,
            hasRecords: divActs.length > 0,
            liveValue: propCurrentValue > 0 ? propCurrentValue : (holdingsValue > 0 ? holdingsValue : fcValue),
            forecast: fc,
        }
    }, [propMonthly, propByHolding, propCurrentValue, dbActs, holdings, enrichedHoldings])

    const { monthly, byHolding, hasRecords, liveValue, hasParqet, forecast: dbForecast } = baseData

    const computed = useMemo(() => {
        if (!hasRecords) return null

        // Kumuliert
        const cum = {}
        Object.keys(monthly).forEach(y => {
            cum[y] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) {
                running += (monthly[y][i] || 0)
                cum[y][i] = +running.toFixed(2)
            }
        })

        // Prognose: bei Parqet-Daten die Props, sonst Saisonprognose aus den eigenen Daten
        const propHasForecast = hasParqet && propForecastMonthly && Object.keys(propForecastMonthly).length > 0
        const forecastM = propHasForecast ? propForecastMonthly : (dbForecast?.monthly ?? seasonalForecast(monthly, cy, cm))
        const forecastC = propHasForecast ? propForecastCum : (dbForecast?.cum ?? {})
        const forecastH = propHasForecast ? propForecastByHolding : (dbForecast?.forecastByHolding ?? {})

        let fNext12mNet = 0
        for (let i = 0; i < 12; i++) {
            const fm = (cm + 1 + i) % 12
            const fy = cy + Math.floor((cm + 1 + i) / 12)
            fNext12mNet += forecastM?.[fy]?.[fm] || 0
        }

        // TTM & YoY (Props nur bei Parqet-Daten)
        const ttmNet = rolling12m(monthly, cy, cm)
        const prevTtmNet = rolling12m(monthly, cy - 1, cm)
        let yoyGrowth = hasParqet ? (propYoy ?? null) : null
        if (yoyGrowth === null && prevTtmNet > 0) {
            yoyGrowth = +(((ttmNet / prevTtmNet) - 1) * 100).toFixed(1)
        }

        // CAGR
        let cagrObj = hasParqet ? (propTrueCagr ?? null) : null
        if (!cagrObj) {
            const years = Object.keys(monthly).map(Number).filter(y => y < cy).sort((a, b) => a - b)
            if (years.length >= 2) {
                const firstY = years[0]
                const lastY = years[years.length - 1]
                const nY = lastY - firstY
                const sVal = yearTotal(monthly, firstY)
                const eVal = yearTotal(monthly, lastY)
                if (sVal > 0 && eVal > 0 && nY > 0) {
                    cagrObj = { val: +(((Math.pow(eVal / sVal, 1 / nY) - 1) * 100)).toFixed(1), from: firstY, to: lastY, years: nY }
                }
            }
        }

        // Wachstum laufendes Jahr: erhaltene Monate + Prognose der restlichen Monate
        const lastYTotal = yearTotal(monthly, cy - 1)
        const curYActual = (monthly?.[cy] || []).reduce((s, v, i) => (i <= cm ? s + (v || 0) : s), 0)
        const curYRest = (forecastM?.[cy] || []).reduce((s, v, i) => (i > cm ? s + (v || 0) : s), 0)
        const curYTotal = curYActual + curYRest
        const growthCy = lastYTotal > 0 && curYTotal > 0 ? +(((curYTotal - lastYTotal) / lastYTotal) * 100).toFixed(1) : null

        // Inflation / realer Wert
        let realVal = hasParqet ? propRealTotal : null
        let inflVal = hasParqet ? propInflation : null
        let hasReal = hasParqet ? propHasRealData : false
        if (realVal == null) {
            try {
                realVal = calcRealTotal(monthly)
                const nominal = Object.values(monthly).flatMap(arr => arr).reduce((s, v) => s + (v || 0), 0)
                inflVal = nominal - realVal
                hasReal = nominal > 0 && Object.keys(monthly).length > 1
            } catch {
                hasReal = false
            }
        }

        return {
            cum,
            forecastMonthly: forecastM,
            forecastCum: forecastC,
            forecastByHolding: forecastH,
            forecast12mNet: fNext12mNet,
            forecast12mAvg: +(fNext12mNet / 12).toFixed(2),
            yoyGrowth, cagrObj, growthCy, ttmNet, lastYTotal, realVal, inflVal, hasReal
        }
    }, [monthly, hasRecords, hasParqet, dbForecast, cy, cm, propForecastMonthly, propForecastCum, propForecastByHolding, propYoy, propTrueCagr, propRealTotal, propInflation, propHasRealData])
    // ── 4. FILTER FÜR ZEITRÄUME (ALL, YTD, 12M, 3J) ──────────────────────────
    const rangeData = useMemo(() => {
        if (!hasRecords) return { net: 0, gross: 0, tax: 0, avg: 0, months: 1, filteredByHolding: {}, filteredHeatmap: {} }

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

        let net = 0
        let gross = 0
        let tax = 0
        const fH = {}
        const fM = {}

        Object.entries(byHolding).forEach(([key, h]) => {
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

            fH[key] = { ...h, monthly: newM, gross: newG, tax: newT }
        })

        Object.keys(monthly).forEach(yStr => {
            const y = Number(yStr)
            for (let m = 0; m < 12; m++) {
                if (isInRange(y, m)) {
                    const val = monthly?.[y]?.[m] || 0
                    if (!fM[y]) fM[y] = Array(12).fill(0)
                    fM[y][m] = val
                    net += val

                    Object.values(byHolding).forEach(h => {
                        gross += (h.gross?.[y]?.[m] || 0)
                        tax += (h.tax?.[y]?.[m] || 0)
                    })
                }
            }
        })

        // Monate seit der ersten Dividende (nicht seit Januar des ersten Jahres)
        let firstIdx = null
        Object.keys(monthly).map(Number).sort((a, b) => a - b).forEach(y => {
            for (let m = 0; m < 12; m++) {
                if (firstIdx === null && (monthly[y]?.[m] || 0) > 0) firstIdx = y * 12 + m
            }
        })
        const sinceFirst = firstIdx === null ? 1 : Math.max(1, cy * 12 + cm - firstIdx + 1)

        let divisor = sinceFirst
        if (kpiRange === 'ytd') divisor = cm + 1
        else if (kpiRange === '12m') divisor = 12
        else if (kpiRange === '3y') divisor = Math.min(36, sinceFirst)

        return {
            net,
            gross: +(gross > 0 ? gross : (net + tax)).toFixed(2),
            tax: +tax.toFixed(2),
            avg: net / divisor,
            months: divisor,
            filteredByHolding: fH,
            filteredHeatmap: fM
        }
    }, [hasRecords, byHolding, monthly, kpiRange, cy, cm])

    // ── 5. ORIGINAL RENDITE-BERECHNUNG ─────────────────────────────────────────
    const currentYield = useMemo(() => {
        if (hasParqet && propDividendYield?.[kpiRange] > 0) return fmtPct(propDividendYield[kpiRange])
        if (!liveValue || liveValue <= 0) return '–'
        // Annualisiertes Netto geteilt durch Depotwert
        const annualNet = rangeData.net * 12 / Math.max(1, rangeData.months)
        return fmtPct((annualNet / liveValue) * 100)
    }, [hasParqet, liveValue, rangeData.net, rangeData.months, kpiRange, propDividendYield])

    const forecastYield = useMemo(() => {
        if (!liveValue || liveValue <= 0 || !computed?.forecast12mNet) return '–'
        // Original: Forecast geteilt durch Depotwert (0,78 % wie in Bild 1!)
        return fmtPct((computed.forecast12mNet / liveValue) * 100)
    }, [liveValue, computed?.forecast12mNet])

    // ── RENDERING ────────────────────────────────────────────────────────────
    const isWorking = (parqetLoading || dbLoading) && !hasRecords
    if (propSkeleton || isWorking) return <SkeletonDashboard />
    if (!hasRecords) return <EmptyStateView onRefresh={handleRefresh} loading={dbLoading} error={error} />

    const rangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'
    const shownError = error || propError
    return (
        <div>
            {/* KOPFZEILE MIT SCHALTER */}
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

            {shownError && (
                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                    ⚠ {shownError}
                </div>
            )}

            {/* 1. KPI-REIHE */}
            <div className="kpi-grid">
                <KpiCard
                    label={`Dividenden Netto (${rangeLabel})`}
                    value={fmt(rangeData.net)}
                    color="#22c55e"
                    detail={{ label: 'Ø Monatlich', value: fmt(rangeData.avg), color: '#a78bfa' }}
                />
                <KpiCard
                    label="Brutto"
                    value={fmt(rangeData.gross)}
                    color="#60a5fa"
                    detail={{ label: 'davon Steuern', value: fmt(rangeData.tax), color: '#fb923c' }}
                />
                <KpiCard
                    label="Dividendenrendite"
                    value={currentYield}
                    color="#34d399"
                    sub={liveValue > 0 ? "auf Marktwert (annualisiert)" : "Marktwert noch nicht erfasst"}
                />
            </div>

            {/* 2. KPI-REIHE (CAGR, YOY & REAL WIE IN BILD 1!) */}
            <div className="kpi-grid">
                {computed.cagrObj !== null && (
                    <KpiCard
                        label={`CAGR (${computed.cagrObj.years}J)`}
                        value={(computed.cagrObj.val >= 0 ? '+' : '') + String(computed.cagrObj.val).replace('.', ',') + ' %'}
                        color={computed.cagrObj.val >= 0 ? '#5bcec2' : '#ef4444'}
                        sub={`${computed.cagrObj.from} – ${computed.cagrObj.to}`}
                    />
                )}
                <KpiCard
                    label="YoY-Wachstum"
                    value={computed.yoyGrowth !== null ? `${computed.yoyGrowth >= 0 ? '+' : ''}${String(computed.yoyGrowth).replace('.', ',')} %` : '–'}
                    color={computed.yoyGrowth !== null ? (computed.yoyGrowth >= 0 ? '#22c55e' : '#ef4444') : '#556070'}
                    sub={computed.yoyGrowth !== null ? '12M vs. Vorjahr' : 'Nicht genügend Daten'}
                />
                {computed.hasReal && (
                    <KpiCard
                        label="Real (inflationsber.)"
                        value={fmt(computed.realVal)}
                        color="#f59e0b"
                        detail={{ label: 'Verlust', value: fmt(computed.inflVal), color: '#ef4444' }}
                        sub={`Basis: ${Object.keys(monthly).map(Number).sort()[0]}`}
                    />
                )}
            </div>

            {/* 3. KPI-REIHE (PROGNOSE WIE IN BILD 1!) */}
            <p style={{ fontSize:10, color:'#3d5266', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8, marginTop:6 }}>Prognose · Nächste 12 Monate</p>
            <div className="kpi-grid">
                <KpiCard
                    label="Voraussichtlich Netto"
                    value={fmt(computed.forecast12mNet)}
                    color="#f472b6"
                    detail={{ label:'Ø Monatlich', value: fmt(computed.forecast12mAvg), color:'#f472b6' }}
                    sub="Basierend auf Vorjahren"
                />
                <KpiCard
                    label={`Wachstum ${cy} vs. ${cy - 1}`}
                    value={computed.growthCy !== null ? `${computed.growthCy >= 0 ? '+' : ''}${String(computed.growthCy).replace('.', ',')} %` : '–'}
                    color={computed.growthCy !== null && computed.growthCy >= 0 ? '#22c55e' : '#ef4444'}
                    sub="Prognose Gesamtjahr"
                />
                <KpiCard
                    label="Progn. Dividendenrendite"
                    value={forecastYield}
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
                    monthly={monthly}
                    forecastMonthly={computed.forecastMonthly}
                    byHolding={rangeData.filteredByHolding}
                    forecastByHolding={computed.forecastByHolding}
                    kpiRange={kpiRange}
                />
                <CumulativeDividendChart
                    monthly={monthly}
                    cum={computed.cum}
                    forecastCum={computed.forecastCum}
                    byHolding={rangeData.filteredByHolding}
                />
            </div>

            {/* HEATMAP */}
            <div style={{ marginTop: 16 }}>
                <DividendHeatmap monthly={rangeData.filteredHeatmap} />
            </div>

            {/* DONUT & TABELLE */}
            <div id="dividends-table" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <DividendDonut byHolding={rangeData.filteredByHolding} kpiRange={kpiRange} />
                <PositionsTable byHolding={rangeData.filteredByHolding} kpiRange={kpiRange} />
            </div>
        </div>
    )
}