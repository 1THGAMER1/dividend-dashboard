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

// ── ORIGINAL HILFSFUNKTIONEN WIE IM HOOK ────────────────────────────────────
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
                                              }) {
    const cm = new Date().getMonth()

    // Eigener Range-State (falls nicht von außen gesteuert)
    const [ownRange, setOwnRange] = useState('all')
    const kpiRange = propKpiRange ?? ownRange
    const setKpiRange = propSetKpiRange ?? setOwnRange

    // ── 1. SUPABASE DATEN LADEN ──────────────────────────────────────────────
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

    // ── 2. DATENBASIS ERSTELLEN (AUS SUPABASE ODER PARQET) ───────────────────
    const baseData = useMemo(() => {
        const hasParqet = Boolean(propMonthly && Object.keys(propMonthly).length > 0)

        // Wenn Parqet-Daten da sind, nutze diese Struktur
        if (hasParqet) {
            return {
                monthly: propMonthly,
                byHolding: propByHolding || {},
                hasRecords: true,
                liveValue: propCurrentValue
            }
        }

        // ANDERNFALLS: Vollständig aus Supabase aufbauen!
        const m = {}
        const h = {}
        let divCount = 0
        let totalBuy = 0

        ;(dbActs || []).forEach(a => {
            const type = String(a.type || '').toLowerCase()
            const amt = Number(a.amount ?? 0)

            if (type === 'buy') {
                totalBuy += amt
                return
            }
            if (type === 'sell') {
                totalBuy = Math.max(0, totalBuy - amt)
                return
            }

            if (type !== 'dividend') return

            const d = new Date(a.date || a.datetime || 0)
            if (isNaN(d.getTime())) return

            divCount++
            const y = d.getFullYear()
            const mon = d.getMonth()
            const net = Number(a.amountNet ?? a.amount ?? 0)
            const tax = Number(a.tax ?? 0)
            const gross = Number(a.gross ?? (net + tax))
            const key = a.isin || a.name || 'Unbekannt'

            // Monthly
            if (!m[y]) m[y] = Array(12).fill(0)
            m[y][mon] = +(m[y][mon] + net).toFixed(2)

            // byHolding
            if (!h[key]) {
                h[key] = {
                    name: a.name || key,
                    isin: a.isin || key,
                    assetType: a.assetType || 'Security',
                    totalNet: 0,
                    monthly: {},
                    gross: {},
                    tax: {}
                }
            }
            if (!h[key].monthly[y]) h[key].monthly[y] = Array(12).fill(0)
            if (!h[key].gross[y])   h[key].gross[y] = Array(12).fill(0)
            if (!h[key].tax[y])     h[key].tax[y] = Array(12).fill(0)

            h[key].monthly[y][mon] = +(h[key].monthly[y][mon] + net).toFixed(2)
            h[key].gross[y][mon]   = +(h[key].gross[y][mon] + gross).toFixed(2)
            h[key].tax[y][mon]     = +(h[key].tax[y][mon] + tax).toFixed(2)
            h[key].totalNet        = +(h[key].totalNet + net).toFixed(2)
        })

        return {
            monthly: m,
            byHolding: h,
            hasRecords: divCount > 0,
            liveValue: propCurrentValue > 0 ? propCurrentValue : totalBuy
        }
    }, [propMonthly, propByHolding, propCurrentValue, dbActs])

    const { monthly, byHolding, hasRecords, liveValue } = baseData

    // ── 3. ORIGINALE BERECHNUNGSLOGIK (WIE VORHER) ───────────────────────────
    const computed = useMemo(() => {
        if (!hasRecords) return null

        // Kumulierte Werte berechnen (Original)
        const cum = {}
        Object.keys(monthly).forEach(y => {
            cum[y] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) {
                running += (monthly[y][i] || 0)
                cum[y][i] = +running.toFixed(2)
            }
        })

        // Prognose basierend auf Vorjahr (Original)
        const forecastM = {}
        const forecastC = {}
        const prevYear = monthly[cy - 1] || Array(12).fill(0)

        ;[cy, cy + 1].forEach(targetY => {
            forecastM[targetY] = Array(12).fill(0)
            forecastC[targetY] = Array(12).fill(0)
            let run = 0
            for (let i = 0; i < 12; i++) {
                let exp = 0
                if (targetY === cy) {
                    exp = i <= cm ? (monthly[cy]?.[i] || 0) : (prevYear[i] || 0)
                } else {
                    exp = (monthly[cy]?.[i] || 0) > 0 ? monthly[cy][i] : (prevYear[i] || 0)
                }
                forecastM[targetY][i] = exp
                run += exp
                forecastC[targetY][i] = +run.toFixed(2)
            }
        })

        // Nächste 12 Monate Prognose (Original)
        let fNext12m = 0
        for (let i = 0; i < 12; i++) {
            const fm = (cm + 1 + i) % 12
            const fy = cy + Math.floor((cm + 1 + i) / 12)
            fNext12m += forecastM?.[fy]?.[fm] || 0
        }

        // TTM (Letzte 12 Monate rollierend) (Original)
        const ttmNet = rolling12m(monthly, cy, cm)
        const prevTtmNet = rolling12m(monthly, cy - 1, cm)
        const yoyGrowth = prevTtmNet > 0 ? +(((ttmNet / prevTtmNet) - 1) * 100).toFixed(1) : null

        // CAGR Gesamt (Original)
        const years = Object.keys(monthly).map(Number).filter(y => y < cy).sort()
        let cagrObj = null
        if (years.length >= 2) {
            const firstY = years[0]
            const lastY = years[years.length - 1]
            const nY = lastY - firstY
            const sVal = yearTotal(monthly, firstY)
            const eVal = yearTotal(monthly, lastY)
            if (sVal > 0 && eVal > 0 && nY > 0) {
                cagrObj = {
                    val: +(((Math.pow(eVal / sVal, 1 / nY) - 1) * 100)).toFixed(1),
                    from: firstY,
                    to: lastY,
                    years: nY
                }
            }
        }

        // Wachstum laufendes Jahr vs Vorjahr (Original)
        const lastYTotal = yearTotal(monthly, cy - 1)
        const curYForecast = (forecastM[cy] || []).reduce((s, v) => s + v, 0)
        const growthCy = lastYTotal > 0 ? +(((curYForecast - lastYTotal) / lastYTotal) * 100).toFixed(1) : null

        return {
            cum,
            forecastMonthly: forecastM,
            forecastCum: forecastC,
            forecast12mNet: fNext12m,
            forecast12mAvg: +(fNext12m / 12).toFixed(2),
            yoyGrowth,
            cagrObj,
            growthCy,
            ttmNet,
            lastYTotal
        }
    }, [monthly, hasRecords, cy, cm])

    // ── 4. FILTER FÜR ZEITRÄUME (ALL, YTD, 12M, 3J) ──────────────────────────
    const rangeData = useMemo(() => {
        if (!hasRecords) return { net: 0, gross: 0, tax: 0, avg: 0, filteredByHolding: {}, filteredHeatmap: {} }

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

        // Original-Divisor wie im Hook:
        const divisor = kpiRange === 'ytd' ? (cm + 1) : kpiRange === '12m' ? 12 : kpiRange === '3y' ? 36 : Math.max(1, Object.keys(monthly).length * 12)

        return {
            net,
            gross: gross > 0 ? gross : net,
            tax,
            avg: net / divisor,
            filteredByHolding: fH,
            filteredHeatmap: fM
        }
    }, [hasRecords, byHolding, monthly, kpiRange, cy, cm])

    // ── 5. ORIGINAL RENDITE BERECHNUNGEN ──────────────────────────────────────
    const currentYield = useMemo(() => {
        if (!liveValue || liveValue <= 0 || !computed) return '–'
        // Original: TTM-Dividenden geteilt durch Depotwert
        const yieldVal = (computed.ttmNet / liveValue) * 100
        return fmtPct(yieldVal)
    }, [liveValue, computed])

    const forecastYield = useMemo(() => {
        if (!liveValue || liveValue <= 0 || !computed) return '–'
        // Original: Nächste 12M Prognose geteilt durch Depotwert
        const yieldVal = (computed.forecast12mNet / liveValue) * 100
        return fmtPct(yieldVal)
    }, [liveValue, computed])

    // ── GECONTROLTER RENDERING-ABLAUF ─────────────────────────────────────────
    const isWorking = (parqetLoading || dbLoading) && !hasRecords
    if (propSkeleton || isWorking) return <SkeletonDashboard />
    if (!hasRecords) return <EmptyStateView onRefresh={handleRefresh} loading={dbLoading} error={error} />

    const rangeLabel = KPI_RANGES.find(r => r.key === kpiRange)?.label || 'Gesamt'

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

            {error && (
                <div style={{ background:'#2d0a0a', border:'1px solid #7f1d1d', color:'#fca5a5', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:12 }}>
                    ⚠ {error}
                </div>
            )}

            {/* 1. KPI-REIHE (ORIGINAL) */}
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
                    sub={liveValue > 0 ? "12M rollierend / Marktwert" : "Marktwert noch nicht erfasst"}
                />
            </div>

            {/* 2. KPI-REIHE (ORIGINAL CAGR & YOY) */}
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
            </div>

            {/* 3. KPI-REIHE (ORIGINAL PROGNOSE) */}
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
                    forecastByHolding={{}}
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