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
        activities = [],
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

    // Einheitliche lokale Synthese der Prognose für Supabase und Parqet
    const fallback = useMemo(() => {
        const m = {}
        const h = {}
        const lotsByKey = {}   // Wertpapier -> { shares, cost } (Durchschnittskosten)
        const trades = {}      // Wertpapier -> [{ t, d }]  (+ Zugang / − Abgang an Anteilen)
        const divPays = {}     // Wertpapier -> [{ idx, net, shares, t }]

        // Chronologisch (älteste zuerst): die Datenbank liefert neueste zuerst
        const sourceActivities = hasPropData ? activities : dbActs
        const normalizedActivities = (sourceActivities || []).map(activity => ({
            ...activity,
            date: activity.date || activity.datetime,
            datetime: activity.datetime || activity.date,
            isin: activity.isin || activity.asset?.isin || activity.asset?.symbol,
            name: activity.name || activity.asset?.name || activity.asset?.symbol,
            assetType: activity.assetType || activity.holdingAssetType || activity.asset?.assetType,
            amountNet: activity.amountNet ?? activity.amount,
            gross: activity.gross ?? activity.amount,
        }))
        const chronological = normalizedActivities.sort(
            (x, y) => new Date(x.date || x.datetime || 0) - new Date(y.date || y.datetime || 0)
        )

        chronological.forEach(a => {
            const rawType = String(a.type || '').trim().toLowerCase()
            const type = ['dividende', 'dividenden'].includes(rawType) ? 'dividend' : rawType
            const amt = Number(a.amount ?? 0)
            const sh = Number(a.shares) || 0
            const tradeKey = a.isin || a.name || 'Unbekannt'
            const tradeT = new Date(a.date || a.datetime || 0).getTime()

            // Einstand mit Durchschnittskosten: Verkäufe reduzieren den Einstand der verkauften Anteile
            const lot = (lotsByKey[tradeKey] ||= { shares: 0, cost: 0 })
            if (type === 'buy') { lot.shares += sh; lot.cost += amt }
            if (type === 'sell' && lot.shares > 0) {
                const sold = Math.min(sh, lot.shares)
                lot.cost -= (lot.cost / lot.shares) * sold
                lot.shares -= sold
            }

            // Anteilsbewegungen, damit der Bestand zu jedem Zeitpunkt bekannt ist
            const delta = ['buy', 'transfer_in'].includes(type) ? sh : (['sell', 'transfer_out'].includes(type) ? -sh : 0)
            if (delta !== 0 && !isNaN(tradeT)) (trades[tradeKey] ||= []).push({ t: tradeT, d: delta })

            if (type !== 'dividend') return

            const d = new Date(a.date || a.datetime || 0)
            if (isNaN(d.getTime())) return

            const y = d.getFullYear(), mon = d.getMonth()
            const net = Number(a.amountNet ?? a.amount ?? 0)
            const tax = Number(a.tax ?? 0)
            const gross = (Number(a.gross) > net) ? Number(a.gross) : +(net + tax).toFixed(2)
            const key = a.isin || a.name || 'Unbekannt'
            ;(divPays[key] ||= []).push({ idx: y * 12 + mon, net, shares: sh, t: d.getTime() })

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
        // ── PROGNOSE: Dividende je Anteil × aktueller Bestand ──────────────────
        // Das Wachstum ist reines Dividendenwachstum JE ANTEIL. Zukäufe, Sparpläne und Verkäufe
        // fließen nicht ein. Der aktuelle Bestand bestimmt nur, wie viele Anteile ausschütten.
        const MAX_GROWTH = 1.2   // Deckel für das Wachstum je Anteil pro Jahr (wie in buildForecast)
        const MIN_GROWTH = 0.9
        const nowIdx = cy * 12 + cm

        const sharesAt = (key, ts) => (trades[key] || []).reduce((s, x) => (x.t <= ts ? s + x.d : s), 0)

        // Aktueller Bestand: bevorzugt von Parqet (splitbereinigt), sonst aus den eigenen Käufen/Verkäufen
        const holdingShares = {}
        ;[...(holdings || []), ...(enrichedHoldings || [])].forEach(p => {
            const s = Number(p.shares)
            if (!Number.isFinite(s)) return
                ;[p.isin, p.id].filter(Boolean).forEach(k => { holdingShares[k] = s })
        })
        const sharesNow = (key) => (key in holdingShares ? holdingShares[key] : sharesAt(key, Infinity))

        const forecastH = {}
        const forecastM = {}
        ;[cy, cy + 1].forEach(ty => { forecastM[ty] = Array(12).fill(0) })
        let base12 = 0, fc12 = 0   // nächste 12 Monate: ohne und mit Wachstum (für die Anzeige)

        Object.entries(h).forEach(([key, hh]) => {
            // Dividende je Anteil pro Monat (Summe, falls mehrere Zahlungen im Monat)
            const dpsAt = {}
            ;(divPays[key] || []).forEach(p => {
                const sh = p.shares > 0 ? p.shares : sharesAt(key, p.t)
                if (sh > 0) dpsAt[p.idx] = (dpsAt[p.idx] || 0) + p.net / sh
            })

            // Wachstum je Anteil: gleiche Zahlungsmonate, letzte 12 Monate gegen die 12 Monate davor
            let sumNow = 0, sumPrev = 0
            const base = Array(12).fill(0)   // letzte bekannte Dividende je Anteil pro Kalendermonat
            for (let k = 0; k < 12; k++) {
                const idx = nowIdx - k
                const a = dpsAt[idx] || 0
                const b = dpsAt[idx - 12] || 0
                if (a > 0 && b > 0) { sumNow += a; sumPrev += b }
                base[idx % 12] = a > 0 ? a : (k === 0 ? b : 0)   // laufender Monat noch offen: Vorjahr als Basis
            }
            const growth = sumPrev > 0 ? Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, sumNow / sumPrev)) : 1

            const shares = sharesNow(key)
            const held = shares > 0.000001
            const fMonthly = {}

            ;[cy, cy + 1].forEach(ty => {
                fMonthly[ty] = Array(12).fill(0)
                for (let i = 0; i < 12; i++) {
                    const actual = hh.monthly?.[ty]?.[i] || 0
                    const isPast = ty === cy && i < cm
                    const isNow = ty === cy && i === cm
                    let val

                    if (isPast || (isNow && actual > 0) || !held) {
                        // Ist-Werte; verkaufte Positionen haben keine Prognose
                        val = (ty === cy && i <= cm) ? actual : 0
                    } else {
                        const monthsAhead = (ty - cy) * 12 + (i - cm)
                        const years = Math.max(1, Math.ceil(monthsAhead / 12))
                        val = (base[i] || 0) * Math.pow(growth, years) * shares
                        if (monthsAhead >= 1 && monthsAhead <= 12) {
                            base12 += (base[i] || 0) * shares
                            fc12 += val
                        }
                    }

                    fMonthly[ty][i] = +val.toFixed(2)
                    forecastM[ty][i] = +((forecastM[ty][i] || 0) + val).toFixed(2)
                }
            })
            forecastH[key] = { ...hh, monthly: fMonthly, growthFactor: +growth.toFixed(3), sharesNow: shares }
        })

        // Kumulierte Prognose
        const forecastC = {}
        ;[cy, cy + 1].forEach(ty => {
            forecastC[ty] = Array(12).fill(0)
            let running = 0
            for (let i = 0; i < 12; i++) { running += (forecastM[ty][i] || 0); forecastC[ty][i] = +running.toFixed(2) }
        })

        // Nächste 12 Monate ab dem Folgemonat
        let total = 0
        for (let i = 0; i < 12; i++) {
            const fm = (cm + 1 + i) % 12
            const fy = cy + Math.floor((cm + 1 + i) / 12)
            total += forecastM?.[fy]?.[fm] ?? 0
        }
        const growthPct = base12 > 0 ? +(((fc12 / base12) - 1) * 100).toFixed(1) : null
        const forecast12mLocal = { total: +total.toFixed(2), avg: +(total / 12).toFixed(2), net: +total.toFixed(2), growthPct }

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

        const holdingsValue = (enrichedHoldings?.length ? enrichedHoldings : holdings || [])
            .reduce((s, p) => s + (Number(p.value) || 0), 0)
        const totalCost = Object.values(lotsByKey).reduce((s, l) => s + Math.max(0, l.cost), 0)
        const valueIsCost = !(propCurrentValue > 0) && !(holdingsValue > 0)
        const liveVal = propCurrentValue > 0 ? propCurrentValue : (holdingsValue > 0 ? holdingsValue : totalCost)

        // Monate seit der ersten Dividende (für die Annualisierung kurzer Historien)
        let firstIdx = null
        Object.keys(m).map(Number).sort((a, b) => a - b).forEach(y => {
            for (let mo = 0; mo < 12; mo++) {
                if (firstIdx === null && (m[y][mo] || 0) > 0) firstIdx = y * 12 + mo
            }
        })
        const sinceFirst = firstIdx === null ? 1 : Math.max(1, cy * 12 + cm - firstIdx + 1)
        const monthsFor = { all: sinceFirst, ytd: Math.min(cm + 1, sinceFirst), '12m': Math.min(12, sinceFirst), '3y': Math.min(36, sinceFirst) }

        const dividendYieldLocal = {}
        ;['all', 'ytd', '12m', '3y'].forEach(r => {
            dividendYieldLocal[r] = liveVal > 0 ? +(((kpiLocal[r].net * 12 / monthsFor[r]) / liveVal) * 100).toFixed(2) : 0
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
            valueIsCost,
        }
    }, [hasPropData, activities, dbActs, propCurrentValue, cy, cm, holdings, enrichedHoldings])

    // ── EFFEKTIVE WERTE: Props haben IMMER Vorrang vor dem Fallback ───────────
    const monthly = hasPropData ? propMonthly : (fallback?.monthly || {})
    const byHolding = hasPropData ? (propByHolding || {}) : (fallback?.byHolding || {})
    const hasLocalForecast = Boolean(fallback && Object.keys(fallback.forecastMonthly || {}).length > 0)
    const forecastMonthly = hasLocalForecast ? fallback.forecastMonthly : (propForecastMonthly || {})
    const forecastByHolding = hasLocalForecast ? fallback.forecastByHolding : (propForecastByHolding || {})
    const forecastCumEff = hasLocalForecast ? fallback.forecastCum : (propForecastCum || {})
    const forecast12m = hasLocalForecast ? fallback.forecast12m : propForecast12m
    const yoy = hasPropData ? propYoy : fallback?.yoy
    const trueCagr = hasPropData ? propTrueCagr : fallback?.trueCagr
    const k = hasPropData ? propK : (fallback ? { net: fmt(fallback.kpi[kpiRange]?.net ?? 0), gross: fmt(fallback.kpi[kpiRange]?.gross ?? 0), tax: fmt(fallback.kpi[kpiRange]?.tax ?? 0), avg: fmt(fallback.kpi[kpiRange]?.avgMonthly ?? 0) } : { net: '–', gross: '–', tax: '–', avg: '–' })
    const dividendYield = hasPropData ? propDividendYield : (fallback?.dividendYield || {})
    const currentValue = hasPropData ? propCurrentValue : (fallback?.currentValue || 0)
    const realTotal = hasPropData ? propRealTotal : fallback?.realTotal
    const inflation = hasPropData ? propInflation : fallback?.inflation
    const hasRealData = hasPropData ? propHasRealData : fallback?.hasRealData
    const hasAnyRecords = hasPropData ? true : Boolean(fallback?.hasRecords)
    const valueIsCost = hasPropData ? false : Boolean(fallback?.valueIsCost)

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

    const yieldInfo = useMemo(() => {
        let net = 0
        Object.values(filteredMonthlyForHeatmap || {}).forEach(arr => {
            ;(arr || []).forEach(value => { net += value || 0 })
        })

        // Monate seit der ersten Dividende (junge Historien nicht unterschätzen)
        let firstIdx = null
        Object.keys(monthly || {}).map(Number).sort((a, b) => a - b).forEach(y => {
            for (let mo = 0; mo < 12; mo++) {
                if (firstIdx === null && (monthly[y]?.[mo] || 0) > 0) firstIdx = y * 12 + mo
            }
        })
        const sinceFirst = firstIdx === null ? 1 : Math.max(1, cy * 12 + cm - firstIdx + 1)
        const span = { all: sinceFirst, ytd: cm + 1, '12m': 12, '3y': 36 }[kpiRange] ?? sinceFirst
        const months = Math.max(1, Math.min(span, sinceFirst))
        const annual = (net * 12) / months

        return { months, annual, pct: currentValue > 0 ? (annual / currentValue) * 100 : null }
    }, [filteredMonthlyForHeatmap, monthly, kpiRange, cy, cm, currentValue])

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
                <KpiCard
                    label="Dividendenrendite"
                    value={yieldInfo.pct != null ? fmtPct(yieldInfo.pct) : '–'}
                    color="#34d399"
                    sub={yieldInfo.pct != null ? `auf Marktwert · aus ${yieldInfo.months} Monaten auf 12 hochgerechnet` : 'Marktwert noch nicht erfasst'}
                />
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
                    sub={valueIsCost ? 'Nächste 12M / Einstandswert' : 'Nächste 12M / Marktwert'}
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