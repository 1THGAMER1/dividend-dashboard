import React, { useEffect, useMemo, useState } from 'react'
import PortfolioDashboard from '../components/PortfolioDashboard.jsx'
import AssetAllocationDonut from '../components/AssetAllocationDonut.jsx'
import AssetHoldingDonut from '../components/AssetHoldingDonut.jsx'
import EtfUploadWidget from "../components/EtfUploadWidget.jsx"
import HoldingDetailModal from "../components/HoldingDetailModal.jsx"
import StockDetailView from './StockDetailView.jsx'
import ActivitiesView from './ActivitiesView.jsx'
import { fetchAllDbActivities } from '../utils/manualActivities'
import { fetchCurrentPrice, fetchHoldingHistory } from '../api.js'

const KNOWN_CRYPTO = ['BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'XRP', 'DOT', 'AVAX', 'LINK', 'MATIC', 'BNB', 'USDT', 'USDC']
const FUND_BUYS_FROM_CASH = true

const normKey = (v) => String(v || 'UNBEKANNT').trim().toUpperCase()

// Gewicht eines Geldflusses am Tag: 1 = Tagesanfang (nimmt voll an der Tagesrendite teil), 0 = Tagesende
const flowWeight = (ts) => {
    const h = ts.getUTCHours() + ts.getUTCMinutes() / 60
    if (h === 0) return 1
    return 1 - Math.min(1, Math.max(0, (h - 8) / 13))
}

export default function PortfolioPageView({
                                              page,
                                              onNavigate,
                                              currentValue,
                                              enrichedHoldings,
                                              holdings,
                                              byHolding,
                                              performanceSeries,
                                              activities,
                                              activitiesComplete,
                                              lastUpdated,
                                              onRefreshActivities,
                                              buyActs = [],
                                              sellActs = [],
                                              forecastByHolding = {},
                                          }) {
    const [dbActivities, setDbActivities] = useState([])
    const [dbLoading, setDbLoading] = useState(false)
    const [dbLoaded, setDbLoaded] = useState(false)
    const [manualPrices, setManualPrices] = useState({})
    const [manualHistories, setManualHistories] = useState({})

    useEffect(() => {
        if (!['portfolio-overview', 'portfolio-assets', 'portfolio-xray'].includes(page) ||
            dbLoaded ||
            (enrichedHoldings?.length || holdings?.length)) return

        let cancelled = false
        setDbLoading(true)
        fetchAllDbActivities()
            .then(data => {
                if (!cancelled) setDbActivities(data || [])
            })
            .catch(error => {
                if (!cancelled) console.warn('Manuelle Bestände konnten nicht geladen werden:', error.message)
            })
            .finally(() => {
                if (!cancelled) {
                    setDbLoading(false)
                    setDbLoaded(true)
                }
            })

        return () => { cancelled = true }
    }, [page, dbLoaded, enrichedHoldings?.length, holdings?.length])

    useEffect(() => {
        if (dbActivities.length === 0) return

        const keys = [...new Set(
            dbActivities
                .filter(activity => ['buy', 'transfer_in'].includes(String(activity.type || '').toLowerCase()))
                .map(activity => activity.isin || activity.name)
                .filter(Boolean)
        )]
        let cancelled = false
        Promise.all(keys.map(async key => [key, await fetchCurrentPrice(key)]))
            .then(entries => {
                if (!cancelled) setManualPrices(Object.fromEntries(entries.filter(([, price]) => price > 0)))
            })
            .catch(error => console.warn('Manuelle Kurse konnten nicht geladen werden:', error.message))

        return () => { cancelled = true }
    }, [dbActivities])

    useEffect(() => {
        if (dbActivities.length === 0) return

        const kinds = {}
        dbActivities.forEach(a => {
            const k = a.isin || a.name
            if (k && !kinds[k]) kinds[k] = a.assetType
        })
        const keys = [...new Set(
            dbActivities
                .filter(a => ['buy', 'transfer_in'].includes(String(a.type || '').toLowerCase()))
                .map(a => a.isin || a.name)
                .filter(Boolean)
        )]
        const symbolFor = (key) =>
            /crypto|krypto|coin|token/i.test(kinds[key] || '') || KNOWN_CRYPTO.includes(String(key).toUpperCase())
                ? `${String(key).toUpperCase()}-EUR`
                : key

        let cancelled = false
        Promise.all(keys.map(async key => [key, await fetchHoldingHistory(symbolFor(key))]))
            .then(entries => {
                if (!cancelled) {
                    setManualHistories(Object.fromEntries(
                        entries.filter(([, result]) => result?.history?.length > 0)
                    ))
                }
            })
            .catch(error => console.warn('Historische Kurse konnten nicht geladen werden:', error.message))

        return () => { cancelled = true }
    }, [dbActivities])

    // ─────────────────────────────────────────────────────────────────────────
    // EINZIGE, GEMEINSAME PREISQUELLE für Donut UND Performance-Chart.
    // Priorität: 1. Letzter Schlusskurs aus der Historie, 2. Direkter Live-Kurs.
    // Schlüssel sind normalisiert (trim + uppercase), identisch zur Normalisierung
    // in manualHoldings (item.id) und manualPerformanceSeries (key-Variable).
    // ─────────────────────────────────────────────────────────────────────────
    const unifiedPriceMap = useMemo(() => {
        const map = {}
        Object.entries(manualHistories).forEach(([rawKey, result]) => {
            const rows = result?.history
            if (!Array.isArray(rows) || rows.length === 0) return
            const sorted = [...rows].sort((a, b) => String(a.d).localeCompare(String(b.d)))
            const lastClose = Number(sorted[sorted.length - 1]?.close) || 0
            if (lastClose > 0) map[normKey(rawKey)] = lastClose
        })
        // manualPrices füllt nur Lücken, die Historie hat Vorrang (gleiche Basis wie der Chart)
        Object.entries(manualPrices).forEach(([rawKey, price]) => {
            const k = normKey(rawKey)
            if (!map[k] && Number(price) > 0) map[k] = Number(price)
        })
        return map
    }, [manualPrices, manualHistories])

    const manualHoldings = useMemo(() => {
        const result = {}
        const chronological = dbActivities
            .slice()
            .sort((a, b) => new Date(a.date || a.datetime || 0) - new Date(b.date || b.datetime || 0))

        chronological.forEach(activity => {
            const type = String(activity.type || '').toLowerCase()
            const key = normKey(activity.isin || activity.name)
            const shares = Number(activity.shares) || 0
            const amount = Number(activity.amount ?? activity.amountNet) || 0
            const item = (result[key] ||= {
                id: key,
                isin: activity.isin || key,
                name: activity.name || activity.isin || 'Unbekanntes Asset',
                type: activity.assetType || 'Security',
                shares: 0,
                value: 0,
                costValue: 0,
                realizedGain: 0,
                dividends: 0,
            })

            if (type === 'buy' || type === 'transfer_in') {
                item.shares += shares
                if (type === 'buy') item.costValue += amount
            } else if (type === 'sell' || type === 'transfer_out') {
                const sold = Math.min(shares, item.shares)
                const averageCost = item.shares > 0 ? item.costValue / item.shares : 0
                const soldCost = averageCost * sold
                item.shares = Math.max(0, item.shares - sold)
                item.costValue = Math.max(0, item.costValue - soldCost)
                if (type === 'sell') item.realizedGain += amount - soldCost
            } else if (type === 'dividend') {
                item.dividends += Number(activity.amountNet ?? amount) || 0
            }
        })

        return Object.values(result).map(item => {
            // Nutzt EXAKT dieselbe Preisquelle wie die Performance-Serie (unifiedPriceMap)
            const price = Number(unifiedPriceMap[item.id]) || 0
            const value = price > 0 ? item.shares * price : item.costValue
            return {
                ...item,
                shares: +item.shares.toFixed(6),
                value: +value.toFixed(2),
                costValue: +item.costValue.toFixed(2),
                realizedGain: +item.realizedGain.toFixed(2),
                dividends: +item.dividends.toFixed(2),
            }
        }).filter(item => item.shares > 0.000001 || item.dividends > 0 || item.realizedGain !== 0)
    }, [dbActivities, unifiedPriceMap])

    const manualMode = !enrichedHoldings?.length && !holdings?.length
    const activeHoldings = enrichedHoldings?.length ? enrichedHoldings : holdings?.length ? holdings : manualHoldings
    const manualTradeActivities = useMemo(() => dbActivities
        .filter(activity => ['buy', 'sell'].includes(String(activity.type || '').toLowerCase()))
        .map(activity => ({
            ...activity,
            _type: String(activity.type).toUpperCase(),
            datetime: activity.datetime || activity.date,
            amount: Number(activity.amount ?? activity.amountNet) || 0,
            asset: {
                ...(activity.asset || {}),
                isin: activity.isin || activity.asset?.isin,
                symbol: activity.isin || activity.asset?.symbol,
                name: activity.name || activity.asset?.name,
            },
        })), [dbActivities])
    const effectiveBuyActs = manualMode
        ? manualTradeActivities.filter(activity => activity._type === 'BUY')
        : buyActs
    const effectiveSellActs = manualMode
        ? manualTradeActivities.filter(activity => activity._type === 'SELL')
        : sellActs
    const manualValue = activeHoldings.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

    // ─────────────────────────────────────────────────────────────────────────
    // UNABHÄNGIGE CASH-/INVESTIERT-BILANZ: Läuft IMMER korrekt, auch wenn für
    // KEINE Position eine Kurshistorie geladen werden konnte. Vorher ging das
    // komplette Cash (Dividenden, Verkaufserlöse) verloren, sobald
    // manualHistories leer war, weil es nur aus manualPerformanceSeries kam.
    // ─────────────────────────────────────────────────────────────────────────
    const cashLedger = useMemo(() => {
        let cash = 0
        let invested = 0
        const balances = {}

        const spend = (amount) => {
            if (!FUND_BUYS_FROM_CASH) { invested += amount; return }
            const fromCash = Math.min(Math.max(cash, 0), amount)
            cash -= fromCash
            invested += amount - fromCash
        }

        dbActivities
            .map(a => ({ ...a, ts: new Date(a.date || a.datetime || 0) }))
            .filter(a => !Number.isNaN(a.ts.getTime()))
            .sort((a, b) => a.ts - b.ts)
            .forEach(a => {
                const type = String(a.type || '').trim().toLowerCase()
                const key = normKey(a.isin || a.name)
                const amount = Number(a.amount ?? a.amountNet) || 0
                const pos = (balances[key] ||= { shares: 0, cost: 0 })

                if (type === 'buy') {
                    pos.shares += Number(a.shares) || 0
                    pos.cost += amount
                    spend(amount)
                } else if (type === 'transfer_in') {
                    pos.shares += Number(a.shares) || 0
                    pos.cost += amount
                    invested += Math.max(0, amount)
                } else if (type === 'sell' || type === 'transfer_out') {
                    const sold = Math.min(Number(a.shares) || 0, pos.shares)
                    const avg = pos.shares > 0 ? pos.cost / pos.shares : 0
                    pos.shares -= sold
                    pos.cost = Math.max(0, pos.cost - avg * sold)
                    if (type === 'sell') cash += amount
                    else invested = Math.max(0, invested - avg * sold)
                } else if (type === 'dividend' || type === 'interest') {
                    cash += Number(a.amountNet ?? amount) || 0
                } else if (type === 'deposit') {
                    cash += amount
                    invested += amount
                } else if (type === 'withdrawal') {
                    cash -= amount
                    invested = Math.max(0, invested - amount)
                } else if (type === 'fees_taxes') {
                    spend(amount || (Number(a.fee) || 0) + (Number(a.tax) || 0))
                }
            })

        return { cash: Math.max(0, cash), invested }
    }, [dbActivities])

    const manualPerformanceSeries = useMemo(() => {
        if (dbActivities.length === 0 || Object.keys(manualHistories).length === 0) return []

        const acts = dbActivities
            .map(a => ({ ...a, ts: new Date(a.date || a.datetime || 0) }))
            .filter(a => !Number.isNaN(a.ts.getTime()))
            .sort((a, b) => a.ts - b.ts)
        if (!acts.length) return []
        const startDay = acts[0].ts.toISOString().slice(0, 10)

        const prices = {}
        Object.entries(manualHistories).forEach(([rawKey, result]) => {
            const rows = (result.history || [])
                .map(r => ({ date: String(r.d).slice(0, 10), close: Number(r.close) || 0 }))
                .filter(r => r.close > 0)
                .sort((a, b) => a.date.localeCompare(b.date))
            if (rows.length) {
                prices[normKey(rawKey)] = {
                    rows, idx: 0,
                    splits: (result.splits || []).filter(s => s?.date && s.ratio > 0),
                }
            }
        })
        if (!Object.keys(prices).length) return []

        const adjShares = (key, a) => {
            const day = a.ts.toISOString().slice(0, 10)
            const f = (prices[key]?.splits || []).reduce((acc, s) => (day < s.date ? acc * s.ratio : acc), 1)
            return (Number(a.shares) || 0) * f
        }

        const dates = [...new Set(Object.values(prices).flatMap(p => p.rows.map(r => r.date)).filter(d => d >= startDay))].sort()

        const balances = {}
        let ai = 0
        let cash = 0
        let invested = 0
        const out = []

        const spend = (amount) => {
            if (!FUND_BUYS_FROM_CASH) { invested += amount; return }
            const fromCash = Math.min(Math.max(cash, 0), amount)
            cash -= fromCash
            invested += amount - fromCash
        }

        dates.forEach(date => {
            const dayEnd = new Date(`${date}T23:59:59.999Z`)
            let dayFlow = 0
            let dayFlowW = 0

            while (ai < acts.length && acts[ai].ts <= dayEnd) {
                const a = acts[ai++]
                const investedBefore = invested
                const type = String(a.type || '').trim().toLowerCase()
                const key = normKey(a.isin || a.name)
                const amount = Number(a.amount ?? a.amountNet) || 0
                const pos = (balances[key] ||= { shares: 0, cost: 0 })

                if (type === 'buy') {
                    pos.shares += adjShares(key, a)
                    pos.cost += amount
                    spend(amount)
                } else if (type === 'transfer_in') {
                    pos.shares += adjShares(key, a)
                    pos.cost += amount
                    invested += Math.max(0, amount)
                } else if (type === 'sell' || type === 'transfer_out') {
                    const sold = Math.min(adjShares(key, a), pos.shares)
                    const avg = pos.shares > 0 ? pos.cost / pos.shares : 0
                    pos.shares -= sold
                    pos.cost = Math.max(0, pos.cost - avg * sold)
                    if (type === 'sell') cash += amount
                    else invested = Math.max(0, invested - avg * sold)
                } else if (type === 'dividend' || type === 'interest') {
                    cash += Number(a.amountNet ?? amount) || 0
                } else if (type === 'deposit') {
                    cash += amount
                    invested += amount
                } else if (type === 'withdrawal') {
                    cash -= amount
                    invested = Math.max(0, invested - amount)
                } else if (type === 'fees_taxes') {
                    spend(amount || (Number(a.fee) || 0) + (Number(a.tax) || 0))
                }

                const d = invested - investedBefore
                if (d !== 0) { dayFlow += d; dayFlowW += d * flowWeight(a.ts) }
            }

            // Depotwert: Positionen zum Tageskurs. Fehlt die Historie für eine
            // Position, auf den unifiedPriceMap-Kurs zurückfallen (gleiche Quelle
            // wie der Donut!) statt stumpf auf den Einstandspreis.
            let market = 0
            Object.entries(balances).forEach(([key, pos]) => {
                if (pos.shares <= 1e-9) return
                const p = prices[key]
                if (!p) {
                    const fallbackPrice = Number(unifiedPriceMap[key]) || 0
                    market += fallbackPrice > 0 ? pos.shares * fallbackPrice : pos.cost
                    return
                }
                while (p.idx + 1 < p.rows.length && p.rows[p.idx + 1].date <= date) p.idx++
                market += pos.shares * p.rows[p.idx].close
            })

            out.push({
                d: `${date}T12:00:00.000Z`,
                v: +(market + cash).toFixed(2),
                c: +invested.toFixed(2),
                m: +market.toFixed(2),
                k: +cash.toFixed(2),
                flow: dayFlow,
                fw: dayFlowW,
            })
        })

        let index = 1, peak = 1
        return out
            .filter(p => p.v > 0 || p.c > 0)
            .map((p, i, arr) => {
                if (i > 0) {
                    const prev = arr[i - 1]
                    const base = prev.v + p.fw
                    if (base > 0) {
                        const r = (p.v - prev.v - p.flow) / base
                        if (Number.isFinite(r) && r > -1) index *= 1 + r
                    }
                }
                peak = Math.max(peak, index)
                return {
                    d: p.d, v: p.v, c: p.c, m: p.m, k: p.k,
                    t: +((index - 1) * 100).toFixed(3),
                    dd: +((index / peak - 1) * 100).toFixed(2),
                }
            })
    }, [dbActivities, manualHistories, unifiedPriceMap])

    const effectivePerformanceSeries = manualMode
        ? manualPerformanceSeries
        : (performanceSeries?.length ? performanceSeries : manualPerformanceSeries)

    // Nutzt jetzt die unabhängige Cash-Bilanz statt sich auf die (evtl. leere)
    // Performance-Serie zu verlassen. Funktioniert IMMER korrekt, auch wenn
    // für alle Positionen die Kurshistorie fehlschlägt.
    const manualCash = manualMode ? cashLedger.cash : 0
    const displayValue = manualMode ? manualValue + manualCash : (currentValue > 0 ? currentValue : manualValue)
    const seriesValue = Number(effectivePerformanceSeries?.at?.(-1)?.v) || 0
    const totalValue = seriesValue > 0 ? seriesValue : displayValue
    const [selectedHolding, setSelectedHolding] = useState(null)
    const [fullDetailStock, setFullDetailStock] = useState(null)

    if (fullDetailStock) {
        return (
            <StockDetailView
                stock={fullDetailStock}
                onBack={() => setFullDetailStock(null)}
                allHoldings={activeHoldings}
                buyActs={effectiveBuyActs}
                sellActs={effectiveSellActs}
                byHolding={byHolding}
                totalPortfolioValue={totalValue}
            />
        )
    }

    return (
        <div>
            {page === 'portfolio-overview' && dbLoading && manualMode ? (
                <div style={{ color: '#7a8ba0', fontSize: 13, padding: 20 }}>Lade Bestände…</div>
            ) : page === 'portfolio-overview' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>💼 Portfolio Bestände</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Echtzeit-Depotwerte & Positionen</p>
                    </div>

                    <PortfolioDashboard
                        currentValue={totalValue}
                        holdings={activeHoldings}
                        performanceSeries={effectivePerformanceSeries}
                        buyActs={effectiveBuyActs}
                        sellActs={effectiveSellActs}
                        byHolding={byHolding}
                        forecastByHolding={forecastByHolding}
                        onOpenFullDetail={(item) => setFullDetailStock(item)}
                    />
                </>
            )}

            {page === 'portfolio-assets' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>🍰 Asset Allokation</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Aufteilung deiner echten Depotwerte nach Klassen</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <AssetHoldingDonut holdings={activeHoldings} onNavigate={onNavigate} currentValue={totalValue} />
                        <AssetAllocationDonut holdings={activeHoldings} currentValue={totalValue} />
                    </div>
                </>
            )}

            {page === 'portfolio-xray' && (
                <EtfUploadWidget
                    holdings={activeHoldings}
                    currentValue={totalValue}
                    onSelectHolding={setSelectedHolding}
                />
            )}

            {page === 'portfolio-activities' && (
                <>
                    <div style={{ marginBottom: 14 }}>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e0e6f0' }}>📋 Aktivitäten</h1>
                        <p style={{ color: '#7a8ba0', fontSize: 12, marginTop: 2 }}>Alle Käufe, Verkäufe, Dividenden und weitere Buchungen</p>
                    </div>
                    <ActivitiesView
                        holdings={holdings}
                        enrichedHoldings={enrichedHoldings}
                        activities={activities}
                        complete={activitiesComplete}
                        lastUpdated={lastUpdated}
                        onRefresh={onRefreshActivities}
                    />
                </>
            )}

            {selectedHolding && (
                <HoldingDetailModal
                    holding={selectedHolding}
                    onClose={() => setSelectedHolding(null)}
                    allHoldings={activeHoldings}
                    buyActs={effectiveBuyActs}
                    sellActs={effectiveSellActs}
                    byHolding={byHolding}
                    forecastByHolding={forecastByHolding}
                    range="MAX"
                    totalPortfolioValue={totalValue}
                    onOpenFullDetail={(item) => {
                        setSelectedHolding(null)
                        setFullDetailStock(item)
                    }}
                />
            )}
        </div>
    )
}